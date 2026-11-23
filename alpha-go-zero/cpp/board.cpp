#include <pybind11/pybind11.h>
#include <array>
#include <stdexcept>
#include <string>
#include <vector>

namespace py = pybind11;

class Grid {
    int n;
    std::vector<std::vector<int>> neighbours;
public:
    explicit Grid(int size) : n(size) {
        if (n < 2 || n > 25) throw std::invalid_argument("board size");
        neighbours.resize(n*n);
        for (int p=0; p<n*n; ++p) {
            auto &adj = neighbours[p];
            if (p >= n) adj.push_back(p-n);
            if (p+n < n*n) adj.push_back(p+n);
            if (p%n) adj.push_back(p-1);
            if (p%n+1 < n) adj.push_back(p+1);
        }
    }
    // The caller only needs to enumerate a whole string when it has no liberty.
    void clear_dead(std::string &grid, int first) const {
        const char colour = grid[first];
        std::array<bool,625> seen{};
        std::array<int,625> chain;
        chain[0] = first;
        seen[first] = true;
        int count = 1;
        for (int i=0; i<count; ++i) {
            for (int q : neighbours[chain[i]]) {
                if (!grid[q]) return;
                if (grid[q] == colour && !seen[q]) {
                    seen[q] = true;
                    chain[count++] = q;
                }
            }
        }
        for (int i=0; i<count; ++i) grid[chain[i]] = 0;
    }
    void validate(const std::string &grid, int colour) const {
        if (grid.size() != neighbours.size() || (colour != 1 && colour != 2))
            throw std::invalid_argument("invalid position");
    }
    std::string move(const std::string &grid, int colour, int p) const {
        validate(grid, colour);
        if (p < 0 || p >= n*n || grid[p]) throw std::invalid_argument("occupied or outside board");
        auto next = grid;
        next[p] = static_cast<char>(colour);
        for (int q : neighbours[p]) if (next[q] == 3-colour) clear_dead(next, q);
        clear_dead(next, p);
        return next;
    }
    py::bytes legal(const std::string &grid, int colour, const py::frozenset &history) const {
        validate(grid, colour);
        std::string mask(n*n+1, 0);
        for (int p=0; p<n*n; ++p)
            if (!grid[p]) mask[p] = !history.contains(py::bytes(move(grid, colour, p)));
        mask[n*n] = 1;
        return py::bytes(mask);
    }
    py::bytes ownership(const std::string &grid) const {
        validate(grid,1);
        std::string result = grid;
        std::array<bool,625> seen{};
        for (int p=0; p<n*n; ++p) {
            if (grid[p] || seen[p]) continue;
            std::vector<int> region{p};
            seen[p] = true;
            int border = 0;
            for (size_t i=0; i<region.size(); ++i) {
                for (int q: neighbours[region[i]]) {
                    if (grid[q]) border |= grid[q];
                    else if (!seen[q]) {
                        seen[q] = true;
                        region.push_back(q);
                    }
                }
            }
            const char owner = border == 1 || border == 2 ? static_cast<char>(border) : 0;
            for (int q: region) result[q] = owner;
        }
        return py::bytes(result);
    }
};

PYBIND11_MODULE(_board, m) {
    py::class_<Grid>(m,"Grid").def(py::init<int>())
        .def("move", [](const Grid &g, py::bytes b, int c, int p) {return py::bytes(g.move(b,c,p));})
        .def("legal", &Grid::legal).def("ownership",&Grid::ownership);
}
