"""Reproducible action programs and failure-signature-preserving reduction.

These helpers do not execute inference or qualify a gate. The real runner must
provide the operation interpreter, independent history model and fresh oracle.
"""
import random


OPERATIONS = ('append', 'fork', 'reseed', 'generate', 'rewind', 'checkpoint',
              'evict', 'evaluate', 'retry', 'release', 'gc')


def make_program(seed, steps, token_ids):
    if type(seed) is not int or type(steps) is not int or steps < 0:
        raise ValueError('Integer seed and nonnegative step count required')
    tokens = tuple(token_ids)
    if not tokens or any(type(token) is not int or token < 0 for token in tokens):
        raise ValueError('Nonempty nonnegative token fixture required')
    rng = random.Random(seed)
    known = ['root']
    program = []
    for index in range(steps):
        output = 's' + str(index)
        program.append(dict(op=rng.choice(OPERATIONS), source=rng.choice(known),
                            out=output, token=rng.choice(tokens), seed=rng.getrandbits(64)))
        known.append(output)
    return program


def minimize(program, reproduce):
    """Return a deletion-minimal subsequence preserving the original failure.

    reproduce returns a stable failure signature, or None for a passing program.
    Invalid reduced programs must return a distinct signature or None. Unexpected
    harness errors propagate; they must never be counted as the original failure.
    This finds a local deletion minimum, not a globally shortest program.
    """
    candidate = list(program)
    signature = reproduce(candidate)
    if signature is None:
        raise ValueError('Cannot shrink a passing program')
    partitions = 2
    while candidate:
        width = max(1, (len(candidate)+partitions-1)//partitions)
        reduced = False
        for start in range(0, len(candidate), width):
            trial = candidate[:start] + candidate[start+width:]
            if reproduce(trial) == signature:
                candidate = trial
                partitions = max(2, partitions-1)
                reduced = True
                break
        if reduced:
            continue
        if width == 1:
            break
        partitions = min(len(candidate), partitions*2)
    return candidate
