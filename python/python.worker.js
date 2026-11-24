/* One worker, one dataset, then discard the entire interpreter. */
importScripts('/vendor/pyodide/pyodide.js');
let pyodide;
const WRAPPER = `
import json as _lab_json, sys as _lab_sys, io as _lab_io, traceback as _lab_traceback, contextlib as _lab_contextlib, math as _lab_math, copy as _lab_copy
_lab_dumps = _lab_json.dumps
_lab_loads = _lab_json.loads
_lab_type = type
_lab_dict, _lab_list, _lab_str, _lab_int, _lab_float, _lab_bool = dict, list, str, int, float, bool
_lab_isfinite = _lab_math.isfinite
_lab_TypeError, _lab_ValueError = TypeError, ValueError
class _LabWriter:
    def __init__(self): self.parts, self.size, self.truncated = [], 0, False
    def write(self, text):
        text = str(text)
        remaining = 16000 - self.size
        if remaining > 0:
            self.parts.append(text[:remaining]); self.size += len(text[:remaining])
        if len(text) > remaining: self.truncated = True
        return len(text)
    def flush(self): pass
    def getvalue(self): return ''.join(self.parts) + ('\\n[Output truncated at 16,000 characters]' if self.truncated else '')
def _lab_validate(value, path='$', seen=None, count=None):
    if seen is None: seen = set()
    if count is None: count = [0]
    count[0] += 1
    if count[0] > 50000: raise _lab_ValueError('Result exceeds 50,000 values. Return a compact result.')
    t = _lab_type(value)
    if value is None or t is _lab_bool or t is _lab_str: return
    if t is _lab_int:
        if abs(value) > 9007199254740991: raise _lab_ValueError(path + ': integer exceeds JavaScript safe integer range; use a decimal string when the contract permits it.')
        return
    if t is _lab_float:
        raise _lab_TypeError(path + ': this lab requires integer numbers. Use a decimal string for money as the contract specifies; floats, NaN, and Infinity are not accepted.')
    if t is _lab_list or t is _lab_dict:
        if id(value) in seen: raise _lab_ValueError(path + ': circular result is not JSON-compatible.')
        seen.add(id(value))
        if t is _lab_list:
            for i, v in enumerate(value): _lab_validate(v, path+'['+str(i)+']', seen, count)
        else:
            for k, v in value.items():
                if _lab_type(k) is not _lab_str: raise _lab_TypeError(path + ': object keys must be strings.')
                _lab_validate(v, path+'['+repr(k)+']', seen, count)
        seen.remove(id(value)); return
    raise _lab_TypeError(path + ': return JSON-compatible dict/list/scalar values, not ' + t.__name__)
def _lab_execute(source, input_json):
    out, err = _LabWriter(), _LabWriter()
    namespace = {'__name__': '__practice__'}
    data = _lab_loads(input_json)
    before = _lab_dumps(data, sort_keys=True)
    try:
        with _lab_contextlib.redirect_stdout(out), _lab_contextlib.redirect_stderr(err):
            exec(compile(source, 'solution.py', 'exec'), namespace)
            if not callable(namespace.get('solve')): raise _lab_TypeError('Define a callable solve(data) function.')
            answer = namespace['solve'](data)
            _lab_validate(answer)
            encoded = _lab_dumps(answer, allow_nan=False)
            if len(encoded) > 250000: raise _lab_ValueError('Result exceeds 250,000 characters.')
            if _lab_dumps(data, sort_keys=True) != before: raise _lab_ValueError('solve(data) changed its input. The contract requires leaving data unchanged; copy before mutating.')
        return _lab_dumps({'ok': True, 'value': answer, 'stdout': out.getvalue(), 'stderr': err.getvalue()}, allow_nan=False)
    except BaseException:
        return _lab_dumps({'ok': False, 'error': _lab_traceback.format_exc(limit=12)[-12000:], 'stdout': out.getvalue(), 'stderr': err.getvalue()})
`;
self.onmessage=async({data})=>{
 if(data.type==='init'){
  try{pyodide=await loadPyodide({indexURL:new URL('/vendor/pyodide/',self.location.href).href});pyodide.runPython(WRAPPER);self.postMessage({type:'ready',version:pyodide.runPython('import sys; sys.version.split()[0]')});}
  catch(e){self.postMessage({type:'init-error',error:String(e)})}
 }else if(data.type==='run'){
  try{const start=performance.now();pyodide.globals.set('_lab_source',data.code);pyodide.globals.set('_lab_input_json',JSON.stringify(data.input));const result=pyodide.runPython('_lab_execute(_lab_source, _lab_input_json)');self.postMessage({type:'result',...JSON.parse(result),elapsedMs:Math.round(performance.now()-start)});}
  catch(e){self.postMessage({type:'result',ok:false,error:String(e),stdout:'',stderr:''})}
 }
};
