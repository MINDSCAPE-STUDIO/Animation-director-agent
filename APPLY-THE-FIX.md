# APPLY THE FIX - Step-by-Step Guide

## Critical Bug Summary

**Style Bible and Master Assets context injection exists but is NEVER called.**

Result: Character consistency (Kai), style preservation, and Master Asset references are completely non-functional in production.

---

## FASTEST FIX METHOD: Run Patch Script

### Step 1: Clone the Fix Branch

```bash
git clone https://github.com/MINDSCAPE-STUDIO/Animation-director-agent.git
cd Animation-director-agent
git checkout fix/integrate-generation-context
```

### Step 2: Run the Automated Patch

```bash
node apply-context-fix.js
```

The script will:
- ✅ Add `generation-context` import
- ✅ Inject context into `submitHfImage`
- ✅ Inject context + Master Asset support into `submitHfSpace`
- ✅ Use enriched prompt for all video segments  
- ✅ Inject context into `submitGoogle`

### Step 3: Verify Changes

```bash
# Check syntax
node -c model-router.js

# Review changes
git diff model-router.js
```

###  Step 4: Commit and Push

```bash
git add model-router.js
git commit -m "fix: integrate Style Bible and Master Asset context into generation pipeline"
git push origin fix/integrate-generation-context
```

### Step 5: Merge to Main

Option A - Direct merge (if authorized):
```bash
git checkout main
git merge fix/integrate-generation-context
git push origin main
```

Option B - Create Pull Request:
```bash
# Via GitHub web UI: Create PR from fix/integrate-generation-context to main
```

### Step 6: Verify Deployment

Render should auto-deploy within 2-5 minutes.

Check deployment:
```bash
curl https://animation-director-agent.onrender.com/health
```

Expected response should include:
```json
{
  "service": "animation-director-agent",
  "version": "0.6.0",
  ...
}
```

### Step 7: Test Character Consistency

Create test generation job with Kai Master Asset (see FIX-CONTEXT-INTEGRATION.md for detailed test cases).

---

## ALTERNATIVE: Manual Edit (If Script Fails)

If `apply-context-fix.js` encounters issues, apply the five patches manually:

###  Patch 1: Add Import

**File**: `model-router.js`  
**Line**: ~7 (after `recordEvaluation` import)

Add:
```javascript
const {buildGenerationContext,injectGenerationContext}=require('./generation-context');
```

### Patch 2: submitHfImage

**Function**: `async function submitHfImage(job){`  
**Location**: First line of function body

Add:
```javascript
  // Inject Style Bible and Master Asset context
  const context=buildGenerationContext(job);
  const enrichedPrompt=injectGenerationContext(job.prompt||'',context);
  job={...job,prompt:enrichedPrompt};
```

### Patch 3: submitHfSpace - Context & Master Asset

**Function**: `async function submitHfSpace(job){`  
**Replace**: `if(!job.input?.image)throw Error(...);`

With:
```javascript
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
```

### Patch 4: submitHfSpace - Segment Loop

**Location**: Inside `while(remaining>0.01){` loop  
**Find**: `let segPrompt=job.prompt;`

Replace with:
```javascript
let segPrompt=baseEnrichedPrompt;
```

### Patch 5: submitGoogle

**Function**: `async function submitGoogle(job){`  
**Location**: First line of function body

Add:
```javascript
  // Inject Style Bible and Master Asset context
  const context=buildGenerationContext(job);
  const enrichedPrompt=injectGenerationContext(job.prompt||'',context);
  job={...job,prompt:enrichedPrompt};
```

---

## POST-FIX VALIDATION

After merging and deployment:

### 1. Health Check
```bash
curl https://animation-director-agent.onrender.com/health
curl https://animation-director-agent.onrender.com/ready
```

### 2. Generation Test (Style Bible)
```bash
curl -X POST https://animation-director-agent.onrender.com/api/v1/generation \
  -H "Content-Type: application/json" \
  -d '{
    "type": "text_to_image",
    "project_id": "default",
    "prompt": "Kai in vector style"
  }'
```

Check Render logs for enriched prompt with Style Bible contracts.

### 3. Generation Test (Master Asset)

First, create Kai Master Asset via API or UI with:
- `source_uri`: URL to canonical Kai character sheet
- `canonical_attributes`: Kai's specifications (age 14, height 163cm, etc.)

Then test I2V generation:
```bash
curl -X POST https://animation-director-agent.onrender.com/api/v1/generation \
  -H "Content-Type: application/json" \
  -d '{
    "type": "image_to_video",
    "project_id": "default",
    "master_asset_id": "<kai_asset_id>",
    "prompt": "Kai walking naturally, slight smile"
  }'
```

Expected:
- System uses Kai's `source_uri` as reference image
- Logs confirm Master Asset injection
- Output preserves Kai's canonical appearance

### 4. Multi-Segment Test

Generate 12-second video (triggers 2-3 segments):
```json
{
  "type": "image_to_video",
  "project_id": "default",
  "master_asset_id": "<kai_asset_id>",
  "input": {"duration": 12},
  "prompt": "Kai walking forward in a park"
}
```

Expected:
- All segments use `baseEnrichedPrompt` with Kai specifications
- Character appearance stable across segments
- No visual discontinuity at segment boundaries

---

## TROUBLESHOOTING

### Script Reports "Already Patched"
✅ Patches already applied. Skip to Step 3 (verify).

### Syntax Error After Patching
- Review `model-router.js` diff carefully
- Check for unmatched braces `{}`
- Validate with: `node -c model-router.js`
- If needed, revert and apply patches manually (see Alternative method above)

### Deployment Fails
- Check Render build logs for errors
- Verify all require statements resolve
- Confirm `generation-context.js` exists and exports both functions

### Generation Still Doesn't Use Master Assets
- Confirm Master Asset has valid `source_uri` or `reference_uris[0]`
- Check generation logs for "Inject Style Bible and Master Asset context"
- Verify `master_asset_id` is passed in generation request
- Check evaluation results for style/character drift detection

---

## SUCCESS CRITERIA

✅ `generation-context` module imported in `model-router.js`  
✅ All generation providers inject Style Bible contracts  
✅ I2V generation uses Master Asset reference images automatically  
✅ Multi-segment videos use enriched prompts for consistency  
✅ Kai specifications preserved across all generations  
✅ Character consistency verified in test outputs  
✅ Production pipeline matches specification requirements

---

## NEXT STEPS AFTER FIX

1. **Create Kai Master Asset** with approved character sheet
2. **Populate Style Bible** with complete visual rules for the project  
3. **Test walk cycle generation** with Kai Master Asset
4. **Generate "Kai + Sam park walk" scene** with both character assets
5. **Validate multimodal evaluator** detects style drift correctly
6. **Document Master Asset workflow** for team
7. **Create Sam character** Master Asset with canonical specs
8. **Begin Episode 1 production** with verified character consistency

---

**This fix is CRITICAL for character consistency and is the foundation for all future animation production.**
