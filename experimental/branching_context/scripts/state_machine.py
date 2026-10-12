"""Reproducible action programs and failure-signature-preserving reduction.

These helpers do not execute inference or qualify a gate. The real runner must
provide the operation interpreter, independent history model and fresh oracle.
"""
import random


OPERATIONS = ('append', 'fork', 'reseed', 'generate', 'rewind', 'checkpoint',
              'evict', 'evaluate', 'retry', 'release', 'gc')


class LogicalHistory:
    """Test oracle: tuples and a graph, with no Store/backend imports or files."""
    def __init__(self):
        self.nodes = {}
        self.heads = {}
        self.receipts = {}
        self.pins = {}
        self.released = set()

    def add(self, identity, parent, tokens):
        if parent is not None and parent not in self.nodes:
            raise KeyError(parent)
        node = (parent, tuple(tokens))
        if identity in self.nodes and self.nodes[identity] != node:
            raise ValueError('Immutable identity changed')
        if identity == parent:
            raise ValueError('Self-parent cycle')
        self.nodes[identity] = node

    def history(self, identity):
        segments = []
        while identity is not None:
            identity, tokens = self.nodes[identity]
            segments.append(tokens)
        return tuple(token for segment in reversed(segments) for token in segment)

    def root(self, identity):
        while self.nodes[identity][0] is not None:
            identity = self.nodes[identity][0]
        return identity

    def fork(self, name, identity):
        self.nodes[identity]
        if name in self.heads:
            raise ValueError('Duplicate branch')
        self.heads[name] = (identity, 0)
        return self.heads[name]

    def move(self, name, expected, identity, operation):
        request = (name, expected, identity)
        if operation in self.receipts:
            previous, result = self.receipts[operation]
            if previous != request:
                raise ValueError('Operation payload changed')
            return result
        current, revision = self.heads[name]
        if revision != expected or self.root(current) != self.root(identity):
            raise ValueError('Stale revision or foreign root')
        result = (identity, revision+1)
        self.heads[name] = result
        self.receipts[operation] = (request, result)
        return result

    def release(self, identity):
        self.nodes[identity]
        self.released.add(identity)

    def protect(self, name, identity):
        self.nodes[identity]
        self.pins[name] = identity

    def unprotect(self, name):
        del self.pins[name]

    def collect(self, root):
        if self.root(root) != root:
            raise ValueError('Collection needs a root')
        marked = set(self.nodes)-self.released
        marked.add(root)
        marked.update(self.pins.values())
        marked.update(identity for identity, revision in self.heads.values())
        marked.update(result[0] for request, result in self.receipts.values())
        pending = list(marked)
        while pending:
            parent = self.nodes[pending.pop()][0]
            if parent is not None and parent not in marked:
                marked.add(parent)
                pending.append(parent)
        deleted = {identity for identity in self.nodes if identity not in marked and self.root(identity) == root}
        for identity in deleted:
            del self.nodes[identity]
        self.released.difference_update(deleted)
        return deleted


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
