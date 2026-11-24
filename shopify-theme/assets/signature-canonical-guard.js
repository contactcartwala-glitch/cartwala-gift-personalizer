/* Cartwala-only. The published editor must load this asset before its submit handler. */
(function(scope){
  const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  const pending=new WeakMap();
  const reopen='Re-open your Signature design, restore any missing original photos, then use Save & Preview before adding it to cart. Your existing design has not been replaced.';
  scope.cartwalaEnsureSignatureDesign=function(options){
    const fingerprint=JSON.stringify([options.payload,options.variantIds,options.shop,options.proxy]);
    if(pending.has(options.cache)){const active=pending.get(options.cache);return active.fingerprint===fingerprint?active.run:Promise.reject(Error('Your design changed while saving. Wait for saving to finish, then review and retry.'));}
    const run=(async()=>{
      const {cache,payload,variantIds,editableAvailable,fetch:send,saveDraft}=options;
      if(options.shop!=='0k9icg-ns.myshopify.com'||options.proxy!=='/apps/cartwala-signature-day')throw Error('This Signature editor is not connected to Cartwala.');
      async function post(body,confirming=false){
        const response=await send(options.proxy+(confirming?'/confirm-checkout':''),{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)});
        const json=await response.json();return {ok:response.ok,json};
      }
      async function confirm(id){
        const r=await post({...payload,designId:id,variantIds:variantIds.map(String)},true);
        if(r.ok&&r.json.confirmed===true&&r.json.designId===id&&r.json.protocol==='cartwala-canonical-v1')return true;
        if(r.json.code==='DESIGN_NOT_CANONICAL')return false;
        throw Error('Your print files could not be confirmed. '+reopen);
      }
      async function promote(id){
        if(cache.designId&&cache.designId!==id)cache.replacedDesignId=cache.designId;
        cache.designId=id;delete cache.pendingCanonicalId;await saveDraft();return id;
      }
      let id=cache.pendingCanonicalId||cache.designId;
      // Preflight fresh submissions too: unsupported confirmation routes fail before save.
      if(!id||!UUID.test(id))await confirm('00000000-0000-4000-8000-000000000000');
      if(id&&UUID.test(id)&&await confirm(id))return promote(id);
      if(cache.pendingCanonicalId)throw Error('The saved design is not yet available to Print Files. Please retry; no T-shirts were added.');
      if(!editableAvailable||!payload.printUrls?.length||payload.printUrls.length!==payload.shirtSizes?.length)throw Error(reopen);
      const saved=await post(payload);
      if(!saved.ok||typeof saved.json.designId!=='string'||!UUID.test(saved.json.designId))throw Error('The design could not be saved. '+reopen);
      id=saved.json.designId;cache.pendingCanonicalId=id;await saveDraft();
      if(!await confirm(id))throw Error('The saved design is not yet available to Print Files. Please retry; no T-shirts were added.');
      return promote(id);
    })();
    pending.set(options.cache,{run,fingerprint});run.finally(()=>pending.delete(options.cache)).catch(()=>{});return run;
  };
})(globalThis);
