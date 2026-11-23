from setuptools import setup
from pybind11.setup_helpers import Pybind11Extension

setup(ext_modules=[Pybind11Extension("zero._board", ["cpp/board.cpp"], cxx_std=20, optional=True)])
