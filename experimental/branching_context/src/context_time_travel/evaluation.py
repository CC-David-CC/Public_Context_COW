"""Immutable evaluation provenance. Evaluator execution is a separate operation."""
import math
import hashlib
import json
import os
from pathlib import Path
import shutil
import signal
import subprocess
import sys
import tempfile
import time

from .store import InvalidOperation, _id, _json_bytes, _decode


def evaluate_read_only(candidate, source, *, fixtures, seed, mandatory, timeout_seconds):
    """Run Python scoring in a disposable Linux namespace with no host store mounts.

    Candidate and fixtures are detached JSON/bytes inputs. The evaluator declares
    its own result; isolation does not establish that its scoring code is correct.
    Unsupported namespace isolation fails closed before running evaluator code.
    """
    if sys.platform != 'linux' or not shutil.which('bwrap'):
        raise InvalidOperation('Evaluation requires Linux bubblewrap isolation')
    if not isinstance(source, str) or not source:
        raise InvalidOperation('Evaluator source must be nonempty')
    if type(seed) is not int or seed < 0:
        raise InvalidOperation('Evaluation seed must be a nonnegative integer')
    if type(timeout_seconds) not in (int, float) or not math.isfinite(timeout_seconds) or timeout_seconds <= 0:
        raise InvalidOperation('Evaluation timeout must be positive and finite')
    mandatory = tuple(mandatory)
    if not mandatory or len(set(mandatory)) != len(mandatory):
        raise InvalidOperation('Mandatory checks must be unique and nonempty')
    for name in mandatory:
        _text(name)
    _plain(candidate)
    if not isinstance(fixtures, dict):
        raise InvalidOperation('Fixtures must be a named bytes mapping')
    for name, value in fixtures.items():
        _text(name)
        if type(value) is not bytes:
            raise InvalidOperation('Fixtures must contain exact bytes')
    payload = _json_bytes(dict(candidate=candidate, source=source, seed=seed,
                               fixtures={k: v.hex() for k, v in fixtures.items()}))
    started = time.monotonic()
    status = 'ERROR'
    detail = 'Evaluator did not produce a valid result'
    outcomes = None
    with tempfile.TemporaryDirectory(prefix='ctt-evaluate-') as directory:
        path = Path(directory)
        (path/'input.json').write_bytes(payload)
        (path/'worker.py').write_bytes(Path(__file__).with_name('evaluation_worker.py').read_bytes())
        command = [shutil.which('bwrap'), '--unshare-all', '--die-with-parent', '--new-session',
                   '--clearenv', '--ro-bind', '/usr', '/usr', '--symlink', 'usr/bin', '/bin',
                   '--symlink', 'usr/lib', '/lib', '--symlink', 'usr/lib64', '/lib64',
                   '--proc', '/proc', '--dev', '/dev', '--tmpfs', '/tmp',
                   '--ro-bind', str(path/'input.json'), '/input.json',
                   '--ro-bind', str(path/'worker.py'), '/worker.py', '--chdir', '/tmp',
                   '/usr/bin/python3', '-I', '/worker.py']
        with (path/'stdout').open('wb') as stdout, (path/'stderr').open('wb') as stderr:
            process = subprocess.Popen(command, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                       close_fds=True, start_new_session=True)
            deadline = time.monotonic() + timeout_seconds
            while True:
                pid, wait_status, usage = os.wait4(process.pid, os.WNOHANG)
                if pid:
                    process.returncode = os.waitstatus_to_exitcode(wait_status)
                    break
                if time.monotonic() >= deadline:
                    os.killpg(process.pid, signal.SIGKILL)
                    _, wait_status, usage = os.wait4(process.pid, 0)
                    process.returncode = os.waitstatus_to_exitcode(wait_status)
                    status, detail = 'TIMEOUT', 'Evaluator exceeded wall-time limit'
                    break
                time.sleep(0.01)
        if process.returncode == 0:
            try:
                if (path/'stdout').stat().st_size > 1048576:
                    raise ValueError('Oversized evaluator result')
                proposed = json.loads((path/'stdout').read_bytes())
                _fields(proposed, 'mandatory score unresolved', 'outcomes')
                if not isinstance(proposed['mandatory'], dict):
                    raise ValueError('Invalid check mapping')
                if set(proposed['mandatory']) - set(mandatory):
                    raise ValueError('Undeclared check')
                checks = {name: proposed['mandatory'].get(name, 'UNKNOWN') for name in mandatory}
                if any(v not in ('PASS', 'FAIL', 'UNKNOWN', 'ERROR', 'TIMEOUT') for v in checks.values()):
                    raise ValueError('Invalid check status')
                score = proposed['score']
                if score is not None and (type(score) not in (int, float) or not math.isfinite(score)):
                    raise ValueError('Invalid score')
                if not isinstance(proposed['unresolved'], list):
                    raise ValueError('Invalid unresolved checks')
                for item in proposed['unresolved']:
                    _text(item)
                outcomes = dict(mandatory=checks, score=score, unresolved=proposed['unresolved'])
            except (ValueError, TypeError, OverflowError, InvalidOperation):
                pass
        if outcomes is None:
            outcomes = dict(mandatory={name: status for name in mandatory}, score=None, unresolved=[detail])
        return dict(outcomes=outcomes, source_sha256=hashlib.sha256(source.encode()).hexdigest(),
                    fixture_sha256={k: hashlib.sha256(v).hexdigest() for k, v in fixtures.items()},
                    seed=seed, effect_policy={'mode': 'isolated', 'implementation': 'bubblewrap',
                                             'network': 'unshared', 'host_store': 'unmounted'},
                    environment={'python': '/usr/bin/python3', 'platform': sys.platform,
                                 'resource_scope': 'wait4 evaluator process including waited children'},
                    resources=dict(wall_seconds=time.monotonic()-started,
                                   cpu_seconds=usage.ru_utime+usage.ru_stime,
                                   peak_rss_bytes=usage.ru_maxrss*1024))


def _fields(value, names, label):
    if not isinstance(value, dict) or set(value) != set(names.split()):
        raise InvalidOperation('Invalid evaluation ' + label)


def _text(value):
    if not isinstance(value, str) or not value:
        raise InvalidOperation('Evaluation text must be nonempty')


def _plain(value):
    if isinstance(value, dict):
        for key, item in value.items():
            _text(key)
            _plain(item)
    elif isinstance(value, list):
        for item in value:
            _plain(item)
    elif value is not None and type(value) not in (str, bool, int, float):
        raise InvalidOperation('Evaluation metadata must be JSON data')


def _hashes(value):
    if not isinstance(value, dict):
        raise InvalidOperation('Evaluation hashes must be a named mapping')
    for name, digest in value.items():
        _text(name)
        _id(digest)


def validate_record(value):
    """Validate and detach a report; scores never establish validity by themselves."""
    _fields(value, 'kind schema snapshot_id task_root evaluator fixtures metric seed '
            'environment effect_policy outcomes resources artifacts', 'record fields')
    if value['kind'] != 'evaluation' or type(value['schema']) is not int or value['schema'] != 1:
        raise InvalidOperation('Unsupported evaluation schema')
    _id(value['snapshot_id'])
    _id(value['task_root'])
    evaluator = value['evaluator']
    _fields(evaluator, 'name version source_sha256', 'evaluator')
    _text(evaluator['name'])
    _text(evaluator['version'])
    _id(evaluator['source_sha256'])
    _hashes(value['fixtures'])
    _hashes(value['artifacts'])
    _fields(value['metric'], 'name order', 'metric')
    _text(value['metric']['name'])
    if value['metric']['order'] not in ('minimize', 'maximize'):
        raise InvalidOperation('Unknown evaluation metric order')
    if type(value['seed']) is not int or value['seed'] < 0:
        raise InvalidOperation('Evaluation seed must be a nonnegative integer')
    if not isinstance(value['environment'], dict) or not isinstance(value['effect_policy'], dict):
        raise InvalidOperation('Evaluation environment/effect policy must be mappings')
    if value['effect_policy'].get('mode') not in ('none', 'mocked', 'isolated'):
        raise InvalidOperation('Evaluation effects must be declared')
    outcomes = value['outcomes']
    _fields(outcomes, 'mandatory score unresolved', 'outcomes')
    if not isinstance(outcomes['mandatory'], dict) or not outcomes['mandatory']:
        raise InvalidOperation('Evaluation must record mandatory checks')
    for name, status in outcomes['mandatory'].items():
        _text(name)
        if status not in ('PASS', 'FAIL', 'UNKNOWN', 'ERROR', 'TIMEOUT'):
            raise InvalidOperation('Unknown evaluation check outcome')
    score = outcomes['score']
    if score is not None and (type(score) not in (int, float) or not math.isfinite(score)):
        raise InvalidOperation('Evaluation score must be finite or unavailable')
    if not isinstance(outcomes['unresolved'], list):
        raise InvalidOperation('Unresolved checks must be a list')
    for item in outcomes['unresolved']:
        _text(item)
    resources = value['resources']
    _fields(resources, 'wall_seconds cpu_seconds peak_rss_bytes', 'resources')
    for name in ('wall_seconds', 'cpu_seconds'):
        number = resources[name]
        if type(number) not in (int, float) or not math.isfinite(number) or number < 0:
            raise InvalidOperation('Invalid evaluation time measurement')
    if type(resources['peak_rss_bytes']) is not int or resources['peak_rss_bytes'] < 0:
        raise InvalidOperation('Invalid evaluation memory measurement')
    _plain(value)
    return _decode(_json_bytes(value))
