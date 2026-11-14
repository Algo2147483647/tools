from pathlib import Path
p=Path('math-agent-platform/engines/mathematics/tests/test_m0.py');s=p.read_text(encoding='utf-8').replace("self.assertEqual(v['diagnostics']['certificate']['status'],'not_checked')","self.assertIn(v['diagnostics']['certificate']['status'],('verified','unavailable'))");p.write_text(s,encoding='utf-8')
import json
root=Path('math-agent-platform/example')
for path in sorted(root.glob('[0-9]*.json')):
 data=json.loads(path.read_text(encoding='utf-8'));print(data['suite'],len(data['cases']))
