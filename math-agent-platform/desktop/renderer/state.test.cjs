const test = require('node:test');
const assert = require('node:assert/strict');
const { WorkspaceState } = require('../build/backend/shared/run-state.js');
test('current history ignores stale events and preserves immutable input selection', () => {
  const state = new WorkspaceState();
  state.receive({ id: 'a', input: 'x + 6 = 1', status: 'explaining', events: [1] });
  state.selectedId = 'a'; assert.equal(state.busy, true);
  state.receive({ id: 'a', input: 'x + 6 = 1', status: 'completed', events: [1, 2] });
  assert.equal(state.busy, false);
  assert.equal(state.receive({ id: 'a', input: 'x + 6 = 1', status: 'explaining', events: [1] }), false);
  assert.equal(state.isStale('different'), true); assert.equal(state.isStale('x + 6 = 1'), false);
});

test('stream patches apply in order, deduplicate, detect gaps and reject late events',()=>{
 const state=new WorkspaceState();state.receive({id:'r',input:'q',status:'explaining',events:[],blocks:[],revision:0});
 assert.equal(state.delta({runId:'r',revision:1,event:{type:'message.started',messageId:'m'}}),'applied');
 const patch={runId:'r',revision:2,event:{type:'text.delta',messageId:'m',text:'hello'}};
 assert.equal(state.delta(patch),'applied');assert.equal(state.delta(patch),'stale');
 assert.equal(state.delta({...patch,revision:4}),'gap');assert.equal(state.runs.get('r').blocks[0].text,'hello');
 state.receive({...state.runs.get('r'),revision:5,status:'completed'});assert.equal(state.delta({...patch,revision:6}),'stale');
});
