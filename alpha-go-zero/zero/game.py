"""Tromp–Taylor area, positional superko and two passes, with 7.5 white komi."""
from dataclasses import dataclass
from functools import lru_cache
import numpy as np

try:
    from ._board import Grid
except ImportError:
    Grid = None

RULES = "TT-PSK-7.5-v1"
KOMI = 7.5


@lru_cache
def neighbours(n):
    return tuple(tuple(r*n+c for r, c in ((i//n-1, i%n), (i//n+1, i%n),
                 (i//n, i%n-1), (i//n, i%n+1)) if 0 <= r < n and 0 <= c < n)
                 for i in range(n*n))


@lru_cache
def kernel(n):
    return Grid(n) if Grid is not None else None


def region(grid, start, adj):
    colour = grid[start]
    stack, visited, border = [start], {start}, set()
    while stack:
        for q in adj[stack.pop()]:
            if grid[q] != colour:
                border.add(grid[q])
            elif q not in visited:
                visited.add(q)
                stack.append(q)
    return visited, border


def reference_move(grid, colour, p, n):
    result = bytearray(grid)
    result[p] = colour
    adj = neighbours(n)
    for q in (*adj[p], p):
        if (q == p or result[q] == 3-colour) and result[q]:
            chain, border = region(result, q, adj)
            if 0 not in border:
                for stone in chain:
                    result[stone] = 0
    return bytes(result)


@dataclass(frozen=True, slots=True)
class Board:
    size: int
    grid: bytes
    turn: int
    passes: int
    seen: frozenset
    frames: tuple

    @classmethod
    def empty(cls, size):
        if not 2 <= size <= 25:
            raise ValueError("Board size out of range")
        grid = bytes(size*size)
        return cls(size, grid, 1, 0, frozenset([grid]), (grid,))

    @property
    def done(self):
        return self.passes == 2

    @property
    def colour(self):
        return 1 if self.turn == 1 else 2

    def after_stone(self, p):
        native = kernel(self.size)
        if native:
            return native.move(self.grid, self.colour, p)
        return reference_move(self.grid, self.colour, p, self.size)

    def legal(self):
        length = len(self.grid)
        if self.done:
            return np.zeros(length+1, dtype=np.uint8)
        native = kernel(self.size)
        if native:
            return np.frombuffer(native.legal(self.grid, self.colour, self.seen), np.uint8)
        moves = [v == 0 and self.after_stone(i) not in self.seen for i,v in enumerate(self.grid)]
        return np.asarray([*moves, True], dtype=np.uint8)

    def play(self, p):
        if self.done or not 0 <= p <= len(self.grid):
            raise ValueError("Game finished or move outside the board")
        if p == len(self.grid):
            grid, passes, seen = self.grid, self.passes+1, self.seen
        else:
            if self.grid[p]:
                raise ValueError("Intersection occupied")
            grid = self.after_stone(p)
            if grid in self.seen:
                raise ValueError("Move violates positional superko")
            passes, seen = 0, self.seen | {grid}
        return Board(self.size, grid, -self.turn, passes, seen, (grid, *self.frames[:7]))

    def features(self):
        planes = np.zeros((17, self.size, self.size), np.uint8)
        for i, frame in enumerate(self.frames):
            grid = np.frombuffer(frame, np.uint8).reshape(self.size, self.size)
            planes[i] = grid == self.colour
            planes[8+i] = grid == 3-self.colour
        planes[16].fill(self.turn == 1)
        return planes

    def ownership(self):
        native = kernel(self.size)
        if native:
            grid = np.frombuffer(native.ownership(self.grid),np.uint8).reshape(self.size,self.size)
            return (grid==1).astype(np.int8)-(grid==2).astype(np.int8)
        grid = np.frombuffer(self.grid, np.uint8)
        owner = (grid == 1).astype(np.int8) - (grid == 2).astype(np.int8)
        unseen = set(np.flatnonzero(grid == 0))
        while unseen:
            chain, border = region(self.grid, next(iter(unseen)), neighbours(self.size))
            unseen.difference_update(chain)
            if border in ({1}, {2}):
                owner[list(chain)] = 1 if border == {1} else -1
        return owner.reshape(self.size, self.size)

    def margin(self):
        return float(self.ownership().sum()) - KOMI


def sgf(n, actions, margin=None):
    def coord(a):
        return "" if a == n*n else chr(97+a%n)+chr(97+a//n)
    result = "" if margin is None else f"RE[{'B' if margin > 0 else 'W'}+{abs(margin):g}]"
    header = f"(;FF[4]GM[1]CA[UTF-8]SZ[{n}]KM[{KOMI}]RU[Tromp-Taylor]{result}"
    return header + "".join(f";{'BW'[i%2]}[{coord(a)}]" for i,a in enumerate(actions)) + ")"


def symmetry(plane, code):
    plane = np.rot90(plane, code % 4, axes=(-2, -1))
    return np.flip(plane, axis=-1) if code >= 4 else plane
