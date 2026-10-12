"""Immutable evaluation provenance. Evaluator execution is a separate operation."""
import math

from .store import InvalidOperation, _id, _json_bytes, _decode


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
