const mode=process.env.RUN_MODE??'preflight';
if(mode==='preflight') await import('./runner.mjs');
else if(mode==='execute') await import('./execute.mjs');
else throw new Error('STAGE_E_EXECUTE_ENTRY_INVALID_MODE:'+mode);
