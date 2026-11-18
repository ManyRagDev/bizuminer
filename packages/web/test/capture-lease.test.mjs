import assert from 'node:assert/strict';
import test from 'node:test';
import { CaptureLeaseMonitor } from '../lib/capture-lease.ts';

function clockFixture() {
  let now=0,id=0;
  const timers=new Map();
  return {
    now:()=>now,
    setTimeout(run,delay){const key=++id;timers.set(key,{run,at:now+delay});return key;},
    clearTimeout(key){timers.delete(key);},
    advance(ms){const until=now+ms;for(;;){const next=[...timers].filter(([,timer])=>timer.at<=until).sort((a,b)=>a[1].at-b[1].at)[0];if(!next)break;now=next[1].at;timers.delete(next[0]);next[1].run();}now=until;},
    timers,
  };
}
const minutes=value=>value*60_000;

test('lease estendida na triagem conserva processo além dos 55 minutos originais',()=>{
  const clock=clockFixture();let checks=0;
  const lease=new CaptureLeaseMonitor(()=>checks++,clock);
  lease.update({phase:'capturing',leaseUntil:new Date(minutes(55))});
  clock.advance(minutes(45));
  lease.update({phase:'triaging',leaseUntil:new Date(minutes(75))});
  clock.advance(minutes(11));
  assert.equal(checks,0);
  assert.equal(lease.controller.signal.aborted,false);
  clock.advance(minutes(19));
  assert.equal(checks,1,'deadline only requests a durable state check');
  assert.equal(lease.controller.signal.aborted,false);
  // Recovery committed a wait for the unknown AI outcome before killing it.
  lease.update(null);
  assert.equal(lease.controller.signal.aborted,true);
  assert.equal(clock.timers.size,0);
});

test('sinal atrasado não transforma prazo antigo em autorização para matar processo válido',()=>{
  const clock=clockFixture();let checks=0;
  const lease=new CaptureLeaseMonitor(()=>checks++,clock);
  lease.update({phase:'capturing',leaseUntil:new Date(minutes(55))});
  clock.advance(minutes(55));
  assert.equal(checks,1);
  assert.equal(lease.controller.signal.aborted,false);
  // The expiry-triggered read sees a newer committed lease even if its NOTIFY was delayed.
  lease.update({phase:'triaging',leaseUntil:new Date(minutes(80))});
  clock.advance(minutes(20));
  assert.equal(checks,1);
  assert.equal(lease.controller.signal.aborted,false);
  lease.stop();
  assert.equal(clock.timers.size,0);
});

test('recuperação fenced aborta processo antigo e não cria loop de consultas',()=>{
  const clock=clockFixture();let checks=0;
  const lease=new CaptureLeaseMonitor(()=>checks++,clock);
  lease.update({phase:'capturing',leaseUntil:new Date(minutes(55))});
  clock.advance(minutes(55));
  lease.update({phase:'queued',leaseUntil:new Date(minutes(110))});
  assert.equal(lease.controller.signal.aborted,true);
  clock.advance(minutes(180));
  assert.equal(checks,1);
  assert.equal(clock.timers.size,0);
});
