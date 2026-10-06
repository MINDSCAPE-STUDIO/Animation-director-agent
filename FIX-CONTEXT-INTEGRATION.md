# Context Integration Fix

## Critical Bug Identified

**The Style Bible and Master Assets context injection system exists but is NEVER CALLED in the generation pipeline.**

### Impact

- ❌ Character consistency NOT enforced (Kai specifications ignored)
- ❌ Style Bible rules NOT injected into generation prompts
- ❌ Master Asset references NOT used in I2V generation
- ❌ Reference images from Master Assets NOT passed to providers

### Root Cause

`generation-context.js` exports:
- `buildGenerationContext(job)` - extracts Style Bible + Master Asset for a job
- `injectGenerationContext(prompt, context)` - enriches prompt with contracts

**But neither function is called anywhere in `model-router.js`.**

---

## Fix Required

### Step 1: Add Import

At top of `model-router.js`, after:
```javascript
const {recordEvaluation}=require('./model-performance');
```

Add:
```javascript
const {buildGenerationContext,injectGenerationContext}=require('./generation-context');
```

---

### Step 2: Patch `submitHfImage` Function

Find:
```javascript
async function submitHfImage(job){
  const {Client}=require('@gradio/client');
```

Change to:
```javascript
async function submitHfImage(job){
  // Inject Style Bible and Master Asset context
  const context=buildGenerationContext(job);
  const enrichedPrompt=injectGenerationContext(job.prompt||'',context);
  job={...job,prompt:enrichedPrompt};
  
  const {Client}=require('@gradio/client');
```

---

### Step 3: Patch `submitHfSpace` Function

Find:
```javascript
async function submitHfSpace(job){
  if(job.type!=='image_to_video')throw Error('The free Hugging Face route currently supports Image → Video.');
  if(!job.input?.image)throw Error('Free Image → Video requires a reference image.');
  const {Client}=require('@gradio/client');
```

Change to:
```javascript
async function submitHfSpace(job){
  if(job.type!=='image_to_video')throw Error('The free Hugging Face route currently supports Image → Video.');
  
  // Build Style Bible and Master Asset context
  const context=buildGenerationContext(job);
  const baseEnrichedPrompt=injectGenerationContext(job.prompt||'',context);
  
  // Use Master Asset reference image if available
  let referenceImage=job.input?.image;
  if(!referenceImage&&context.masterAsset){
    referenceImage=context.masterAsset.source_uri||
                   (Array.isArray(context.masterAsset.reference_uris)&&context.masterAsset.reference_uris.length>0?context.masterAsset.reference_uris[0]:null);
  }
  if(!referenceImage)throw Error('Free Image → Video requires a reference image. Specify input.image or link an approved Master Asset with source_uri.');
  
  // Override input with Master Asset reference if found
  job={...job,input:{...(job.input||{}),image:referenceImage}};
  
  const {Client}=require('@gradio/client');
```

---

### Step 4: Patch Segment Loop in `submitHfSpace`

Find (inside the `while(remaining>0.01)` loop):
```javascript
let segPrompt=job.prompt;
```

Change to:
```javascript
let segPrompt=baseEnrichedPrompt;
```

This ensures ALL video segments use the enriched prompt with Style Bible and Master Asset contracts.

---

### Step 5: Patch `submitGoogle` Function

Find:
```javascript
async function submitGoogle(job){
  const key=process.env.GOOGLE_AI_API_KEY;
```

Change to:
```javascript
async function submitGoogle(job){
  // Inject Style Bible and Master Asset context
  const context=buildGenerationContext(job);
  const enrichedPrompt=injectGenerationContext(job.prompt||'',context);
  job={...job,prompt:enrichedPrompt};
  
  const key=process.env.GOOGLE_AI_API_KEY;
```

---

## Automated Application

Run the patch script from the repository root:

```bash
node apply-context-fix.js
```

This will automatically apply all five patches to `model-router.js`.

---

## Verification

After applying:

1. Check `model-router.js` imports `generation-context`
2. Verify `submitHfImage` calls context injection
3. Verify `submitHfSpace` uses Master Asset reference images
4. Verify `submitHfSpace` uses `baseEnrichedPrompt` for segments
5. Verify `submitGoogle` calls context injection
6. Run syntax check: `node -c model-router.js`

---

## Testing After Deployment

### Test 1: Style Bible Injection
```bash
curl -X POST https://animation-director-agent.onrender.com/api/v1/generation \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text_to_image",
    "project_id": "default",
    "prompt": "Kai standing in a park"
  }'
```

Expected: Generation logs should show enriched prompt with Style Bible contracts.

### Test 2: Master Asset Reference for I2V
1. Create Master Asset for Kai with `source_uri` pointing to canonical character sheet
2. Generate video:
```json
{
  "type": "image_to_video",
  "project_id": "default",
  "master_asset_id": "<kai_asset_id>",
  "prompt": "Kai walking forward, smiling naturally"
}
```

Expected:
- System uses `masterAsset.source_uri` as reference image
- Video preserves Kai's canonical appearance
- Logs confirm Master Asset reference was used

### Test 3: Character Consistency Across Segments
Generate 12-second video (2+ segments) with Kai Master Asset.

Expected:
- All segments use enriched prompt with Kai specifications
- Character appearance remains stable across segments
- No sudden visual changes between concatenated segments

---

## Deployment Checklist

- [ ] Patch applied to `model-router.js`
- [ ] Syntax validated with `node -c model-router.js`
- [ ] Committed to `fix/integrate-generation-context` branch
- [ ] Pushed to GitHub
- [ ] Create PR to `main` (or merge directly if authorized)
- [ ] Render auto-deployment triggered
- [ ] Health check passes: `/health` and `/ready`
- [ ] Test image generation with Style Bible
- [ ] Test video generation with Master Asset
- [ ] Verify character consistency in logs and output
- [ ] Document results and any issues

---

## Expected Results

After fix:

✅ Every generation job will inject Style Bible contracts  
✅ Every generation job will inject Master Asset contracts when specified  
✅ I2V generation will automatically use Master Asset reference images  
✅ Multi-segment videos will maintain character consistency via enriched prompts  
✅ Kai's canonical specifications will be preserved across all generations  
✅ Production pipeline matches specification requirements

---

## Next Steps After This Fix

1. **Create Kai Master Asset** with approved character sheet
2. **Update Style Bible** with complete visual language rules
3. **Test character walk cycle** generation with Master Asset
4. **Test "Kai + Sam park walk" scene** with both character assets
5. **Validate evaluation system** detects style/character drift
6. **Document Master Asset creation workflow** for other characters
