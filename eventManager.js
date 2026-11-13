// Greyhaven Motion v0.1.14: scene-persistent, non-graphic protection and fluid-event tracker.
// Independent of visual rendering and independent of individual Record/Stop windows.
const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, Number.isFinite(Number(n)) ? Number(n) : lo));
export const DEFAULT_RISKS = Object.freeze({
  slow: 0.5, medium: 2, fast: 6, impact: 8,
  release1: 10, release2: 30, release3: 40, release4: 60, release5: 80, release6: 90, release7: 100,
  preFluid: 80, preFluidDepth: 65,
});
export const DEFAULT_RANGES = Object.freeze({
  motionMinStrokes: 20, motionMaxStrokes: 50,
  releaseMinStrokes: 0, releaseMaxStrokes: 10,
  preFluidMinStrokes: 1, preFluidMaxStrokes: 100,
});
const RANGE_LIMITS = Object.freeze({
  motionMinStrokes: [0, 1000], motionMaxStrokes: [0, 1000],
  releaseMinStrokes: [0, 1000], releaseMaxStrokes: [0, 1000],
  preFluidMinStrokes: [1, 1000], preFluidMaxStrokes: [1, 1000],
});
function normalizeRanges(opts) {
  for (const [key, [lo,hi]] of Object.entries(RANGE_LIMITS)) {
    opts[key] = Math.floor(clamp(opts[key] ?? DEFAULT_RANGES[key], lo, hi));
  }
  for (const prefix of ['motion', 'release', 'preFluid']) {
    const lo = `${prefix}MinStrokes`, hi = `${prefix}MaxStrokes`;
    if (opts[lo] > opts[hi]) opts[hi] = opts[lo];
  }
}
export function createEventManager({ random=Math.random, options={}, protectedInitially=false }={}) {
  const opts = { ...DEFAULT_RISKS, ...DEFAULT_RANGES, ...options };
  normalizeRanges(opts);
  let id = 0, seq = 0, reportedId=0, strokeCount=0, lastStrokeAt=null;
  let responses = {orgasm:0,squirt:0};
  let log=[];
  let protection=null, preFluid=null;
  const randint=(min,max)=>min+Math.floor(clamp(random(),0,0.999999999)*(max-min+1));
  const roll=()=>clamp(random(),0,0.999999999);
  function emit(type,detail={}) { const e={id:++id, type, stroke:strokeCount, ...detail}; log.push(e); return e; }
  function makePreFluid() { preFluid={ eligible:true, yes:roll() < clamp(opts.preFluid,0,100)/100,
    atStroke:randint(opts.preFluidMinStrokes,opts.preFluidMaxStrokes), happened:false, depthAt:null, reachedDepth:false }; }
  function newProtection() { protection={ active:true, broken:false, riskRoll:roll(), scheduled:null,
    strokes:0, releases:0, retainedReleases:0, failure:null }; preFluid=null; }
  function setProtection(enabled, record=true) {
    // A fresh checkbox activation is a new instance, even if previous protection broke.
    if (enabled) newProtection();
    else { protection=null; makePreFluid(); }
    if(record) emit(enabled ? 'protection-activated' : 'protection-removed');
    lastStrokeAt=null;
  }
  function configure(patch={}) {
    Object.entries(patch).forEach(([k,v])=>{
      if(k in DEFAULT_RISKS) opts[k]=clamp(v,0,100);
      if(k in DEFAULT_RANGES) opts[k]=v;
    });
    normalizeRanges(opts);
  }
  function reset(enabled=false) { seq++; log=[]; id=0; reportedId=0; strokeCount=0; lastStrokeAt=null;
    protection=null; preFluid=null; responses={orgasm:0,squirt:0}; setProtection(enabled,false); }
  function schedule(cause, after) {
    if(!protection?.active || protection.broken) return false;
    const target=protection.strokes+after;
    if (!protection.scheduled || target < protection.scheduled.target) protection.scheduled={cause,target};
    return true;
  }
  function breakProtection(cause='manual') {
    if(!protection?.active || protection.broken) return false;
    protection.broken=true; protection.failure={cause, atStroke:strokeCount, protectedReleases:protection.retainedReleases};
    protection.scheduled=null;
    emit('protection-break', {...protection.failure});
    return true;
  }
  function paceLabel(info, now) {
    const dt=lastStrokeAt==null?Infinity:now-lastStrokeAt;
    // Velocity is simulation-distance units/sec; classification is best-effort gameplay data.
    const quick = dt <= 0.7 ? 'fast' : dt <= 1.5 ? 'medium' : 'slow';
    if (Number(info?.speed)>=35 && Number(info?.travel)>=0.7) return 'impact';
    return quick;
  }
  function onStroke(info={}, nowSeconds=Date.now()/1000) {
    const firstNewEvent=log.length;
    const now=Number(nowSeconds); const pace=paceLabel(info,now);
    lastStrokeAt=now; strokeCount++;
    const depth=clamp(info.peak??info.depth??0,0,1.5);
    if (protection?.active && !protection.broken) {
      protection.strokes++;
      const eligible=clamp(opts[pace],0,100)/100;
      if(!protection.scheduled && protection.riskRoll<eligible) {
        schedule(`motion:${pace}`,randint(opts.motionMinStrokes,opts.motionMaxStrokes));
      }
      if(protection.scheduled && protection.strokes>=protection.scheduled.target)
        breakProtection(protection.scheduled.cause);
    }
    if(preFluid?.eligible && !preFluid.happened && preFluid.yes && strokeCount>=preFluid.atStroke) {
      preFluid.happened=true; preFluid.depthAt=depth;
      preFluid.reachedDepth=depth>clamp(opts.preFluidDepth,0,100)/100;
      emit('pre-fluid', {atDepth:depth, reachedDepth:preFluid.reachedDepth});
    }
    if(preFluid?.happened && !preFluid.reachedDepth && depth>clamp(opts.preFluidDepth,0,100)/100) {
      preFluid.reachedDepth=true;
      emit('pre-fluid-depth-changed',{atDepth:depth});
    }
    return { pace, broken:!!protection?.broken, events:log.slice(firstNewEvent).map(e=>({...e})) };
  }
  function onDepth(depth) {
    if(preFluid?.happened && !preFluid.reachedDepth && Number(depth)>clamp(opts.preFluidDepth,0,100)/100) {
      preFluid.reachedDepth=true;
      return emit('pre-fluid-depth-changed',{atDepth:Number(depth)});
    }
    return null;
  }
  function onProtectedRelease() {
    if(!protection?.active || protection.broken) return false;
    protection.releases++; protection.retainedReleases++;
    const i=Math.min(protection.releases,7), chance=clamp(opts[`release${i}`],0,100)/100;
    if (roll()<chance) schedule(`release:${i}`, i >= 7 ? 0 : randint(opts.releaseMinStrokes,opts.releaseMaxStrokes));
    if(protection.scheduled?.target<=protection.strokes) breakProtection(protection.scheduled.cause);
    return !!protection.broken;
  }
  function recordResponse(type='orgasm') {
    const kind=type==='squirt'?'squirt':'orgasm';
    if(kind==='squirt') {
      responses.squirt++;
      responses.orgasm++;
      return emit(kind,{count:responses.squirt, orgasmCount: responses.orgasm});
    }
    responses.orgasm++;
    return emit(kind,{count:responses.orgasm});
  }
  function pending() { return log.filter(e=>e.id>reportedId).map(e=>({...e})); }
  function markReported(){reportedId=id;}
  function status(){return { protection:protection ? (protection.broken?'broken':'intact'):'off',
    protectionStrokes:protection?.strokes||0, protectionReleases:protection?.releases||0,
    preFluid: preFluid?.happened?'occurred':preFluid?.eligible?'pending':'disabled',
    fluidReachedDepth:!!preFluid?.reachedDepth, responseCounts:{...responses}, sceneStrokeCount:strokeCount, pendingCount:pending().length}; }
  reset(protectedInitially);
  return {configure,reset,setProtection,onStroke,onDepth,onProtectedRelease,breakProtection,recordResponse,pending,markReported,status,
    getEvents:()=>log.map(e=>({...e})), debugSnapshot:()=>({protection:protection&&{...protection},preFluid:preFluid&&{...preFluid},strokeCount})};
}
export function formatEventSummary(events, status) {
  const lines=[];
  for(const e of events) {
    if(e.type==='protection-break') lines.push(`protection failed on scene stroke ${e.stroke} (${e.cause.replaceAll(':',' ')}); previous protected releases: ${e.protectedReleases}${e.protectedReleases > 0 ? '; retained fluid released at failure' : ''}`);
    if(e.type==='protection-activated') lines.push('a new protection instance was enabled');
    if(e.type==='protection-removed') lines.push('protection was removed');
    if(e.type==='pre-fluid') lines.push(`pre-ejaculate event on scene stroke ${e.stroke} at approximately ${Math.round(e.atDepth*100)}% relative depth`);
    if(e.type==='pre-fluid-depth-changed') lines.push(`after the earlier fluid event, the scene reached approximately ${Math.round(e.atDepth*100)}% relative depth`);
    if(e.type==='orgasm') lines.push(`{{receiver}} had an orgasm at scene stroke ${e.stroke}`);
    if(e.type==='squirt') lines.push(`{{receiver}} had an intense orgasm at scene stroke ${e.stroke}, with a squirting response, spraying fluids outward`);
  }
  if(status.protection==='broken') lines.push('current protection state: broken');
  if(status.responseCounts && (status.responseCounts.orgasm || status.responseCounts.squirt))
    lines.push(`scene totals: orgasms ${status.responseCounts.orgasm || 0}, squirting responses ${status.responseCounts.squirt || 0}`);
  return lines.join('; ');
}
