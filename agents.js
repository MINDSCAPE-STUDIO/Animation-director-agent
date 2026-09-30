const DirectorPipeline = {
  version: '0.2',
  stages: ['director','character','motion','camera','background','evaluator'],

  run(shot) {
    const character = this.characterAgent(shot);
    const motion = this.motionAgent(shot, character);
    const camera = this.cameraAgent(shot);
    const background = this.backgroundAgent(shot);
    const evaluation = this.evaluatorAgent({ shot, character, motion, camera, background });
    return { shot, character, motion, camera, background, evaluation };
  },

  characterAgent(shot) {
    return {
      agent: 'character',
      subject: shot.character,
      identity_lock: ['face','body proportions','hair','clothing','silhouette'],
      performance: shot.performance,
      continuity_rules: ['preserve identity across frames','no costume drift','no facial deformation']
    };
  },

  motionAgent(shot, character) {
    const frames = Math.round(shot.duration_seconds * shot.fps);
    return {
      agent: 'motion',
      frame_count: frames,
      action: shot.action,
      path: shot.path,
      mechanics: ['continuous motion','natural weight transfer','stable foot contact','consistent screen direction'],
      character_dependency: character.subject
    };
  },

  cameraAgent(shot) {
    return {
      agent: 'camera',
      framing: shot.camera,
      movement: shot.camera,
      continuity: ['locked composition unless explicitly directed','preserve subject scale','preserve gaze relationship']
    };
  },

  backgroundAgent(shot) {
    return {
      agent: 'background',
      direction: shot.background,
      continuity: ['maintain environment identity','match lighting and perspective','motion must support subject rather than distract']
    };
  },

  evaluatorAgent(bundle) {
    const required = ['character','motion','camera','background'];
    const missing = required.filter(k => !bundle[k]);
    const criteria = bundle.shot.acceptance_criteria || [];
    return {
      agent: 'evaluator',
      status: missing.length ? 'blocked' : 'ready_for_generation',
      missing_agents: missing,
      checks: criteria.map(c => ({ criterion: c, status: 'pending_visual_evaluation' })),
      retry_policy: { max_attempts: 3, escalate_after: 3 },
      rule: 'Never silently approve a failed continuity or identity check.'
    };
  }
};

window.DirectorPipeline = DirectorPipeline;
