// PATCH SCRIPT: Run this with Node.js to apply the context integration fix
// Usage: node apply-context-fix.js

const fs = require('fs');
const path = require('path');

const FILE = path.join(__dirname, 'model-router.js');

console.log('Reading model-router.js...');
let code = fs.readFileSync(FILE, 'utf8');

// PATCH 1: Add import after model-performance require
if (!code.includes("require('./generation-context')")) {
  console.log('PATCH 1: Adding generation-context import...');
  code = code.replace(
    /const \{recordEvaluation\}=require\('\.\/model-performance'\);/,
    "const {recordEvaluation}=require('./model-performance');\nconst {buildGenerationContext,injectGenerationContext}=require('./generation-context');"
  );
}

// PATCH 2: Add context injection to submitHfImage
if (!code.includes('submitHfImage(job){') || !code.match(/submitHfImage[^{]+{\s*const context=buildGenerationContext/)) {
  console.log('PATCH 2: Adding context injection to submitHfImage...');
  code = code.replace(
    /(async function submitHfImage\(job\)\{)/,
    "$1\n  // Inject Style Bible and Master Asset context\n  const context=buildGenerationContext(job);\n  const enrichedPrompt=injectGenerationContext(job.prompt||'',context);\n  job={...job,prompt:enrichedPrompt};\n"
  );
}

// PATCH 3: Replace submitHfSpace image validation with context injection
if (code.includes("if(!job.input?.image)throw Error('Free Image") && !code.includes('const baseEnrichedPrompt=')) {
  console.log('PATCH 3: Adding context injection and Master Asset support to submitHfSpace...');
  code = code.replace(
    /if\(!job\.input\?\.image\)throw Error\('Free Image[^']+?'\);/,
    `// Build Style Bible and Master Asset context
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
  job={...job,input:{...(job.input||{}),image:referenceImage}};`
  );
}

// PATCH 4: Use baseEnrichedPrompt for segments
if (code.includes('let segPrompt=job.prompt;') && code.includes('baseEnrichedPrompt')) {
  console.log('PATCH 4: Using enriched prompt for video segments...');
  code = code.replace(
    /let segPrompt=job\.prompt;/g,
    'let segPrompt=baseEnrichedPrompt;'
  );
}

// PATCH 5: Add context injection to submitGoogle
if (code.includes('async function submitGoogle(job){') && !code.match(/submitGoogle[^{]+{\s*const context=buildGenerationContext/)) {
  console.log('PATCH 5: Adding context injection to submitGoogle...');
  code = code.replace(
    /(async function submitGoogle\(job\)\{)/,
    "$1\n  // Inject Style Bible and Master Asset context\n  const context=buildGenerationContext(job);  \n  const enrichedPrompt=injectGenerationContext(job.prompt||'',context);\n  job={...job,prompt:enrichedPrompt};\n"
  );
}

console.log('Writing patched model-router.js...');
fs.writeFileSync(FILE, code, 'utf8');

console.log('✓ Context integration patch applied successfully!');
console.log('');
console.log('Changes made:');
console.log('1. Added generation-context import');
console.log('2. submitHfImage now injects Style Bible and Master Asset context');
console.log('3. submitHfSpace now uses Master Asset reference images when available');
console.log('4. submitHfSpace uses enriched prompt for all video segments');
console.log('5. submitGoogle now injects Style Bible and Master Asset context');
console.log('');
console.log('Next steps:');
console.log('1. Review the changes in model-router.js');
console.log('2. Test locally if possible');
console.log('3. Commit and push changes');
console.log('4. Deploy and verify on Render');
