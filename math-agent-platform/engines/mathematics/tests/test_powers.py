import unittest
from math_engine import solve
class PowerTests(unittest.TestCase):
 def test_values(self):
  cases={'63/2 + 5*(8/3) - (8/3)^2/8':'791/18','(2/3)^-3':'27/8','(-2/3)**3':'-8/27','-2^2':'-4','(-2)^2':'4','2^3^2':'512','2^-2^2':'1/16','(4/9)^(6/3)':'16/81','0^3':'0','5^0':'1','(0.1)^2':'1/100','2(3/2)^2':'9/2'}
  for expression,value in cases.items():
   with self.subTest(expression=expression):
    r=solve(tool='exact_math',arguments={'expression':expression});self.assertTrue(r['ok'],r);self.assertEqual(r['value']['result']['candidate']['value'],value)
 def test_equations(self):
  for expression in ['(2/3)^-1*x=3','x^1=2','x**1=2']:
   r=solve(tool='exact_math',arguments={'expression':expression});self.assertTrue(r['ok'],r);self.assertEqual(r['value']['result']['candidate']['value'],'2')
 def test_rejections(self):
  for expression in ['0^0','0^-1','4^(1/2)','x^2=4','x^-1=2','2^x=4','x^0=1','2^4097','2^4096','2^3^100','2^^3','2**','9^(x-x)=1']:
   with self.subTest(expression=expression):self.assertFalse(solve(tool='exact_math',arguments={'expression':expression})['ok'])
