export type {
  Vec3,
  SourcePairStatus,
  FieldMetadata,
  Bombsite,
  FieldRecord,
  BombDamageField,
} from './field/types.js';
export {
  EXTERNAL_MODEL_REVISION,
  BombDamageParseError,
  parseBombDamageVdata,
} from './field/parser.js';
export type { ParseBombDamageOptions } from './field/parser.js';
export {
  FieldValidationError,
  assertValidBombDamageField,
  validateBombDamageField,
} from './field/validation.js';
export {
  BOMB_SITE_EXPANSION_UNITS,
  expandBombsiteBounds,
  findBombsiteIndex,
  findNearestPosition,
  getFieldRecord,
} from './field/spatial.js';
export type {
  ExpandedBombsiteBounds,
  NearestPosition,
} from './field/spatial.js';
export type {
  NumericRange,
  C4Outcome,
  PredictC4Input,
} from './engine/types.js';
export { outcomeFromDamageRange, predictC4Outcome } from './engine/outcome.js';
export {
  MAX_C4_DAMAGE,
  MAX_FIELD_DAMAGE,
  MAX_PHASE,
  MIN_DIRECTION_LENGTH,
  applyPlayerCorrections,
  bias,
  calculateRawFieldDamage,
  correctionRangeForDucked,
  decodeBlastDirection,
  integerizeDamage,
  normalizeDirection,
  scaleDamage,
} from './engine/math.js';
export {
  correctKnownDamage,
  evaluateBakedFieldCorrection,
  lookupBakedField,
} from './engine/field-model.js';
export type {
  BakedFieldCorrection,
  BakedFieldCorrectionInput,
  BakedFieldLookup,
  BakedFieldLookupInput,
} from './engine/field-model.js';
export {
  parseQualificationVectors,
  qualifyVectors,
} from './qualification/index.js';
export type {
  QualificationCase,
  QualificationCollisionTrace,
  QualificationFieldTrace,
  QualificationMismatch,
  QualificationResult,
  QualificationTrace,
  QualificationVectors,
} from './qualification/index.js';

export {
  STATIC_MODEL_REVISION,
  STATIC_CLIENT_SHA256,
  STATIC_BUILD_ID,
  LEGACY_MODEL_REVISION,
} from './model-profile.js';
export { createNativeTree } from './field/native-tree.js';
export {
  staticRawDamage,
  staticScaleDamage,
  staticBlastDirection,
  staticPlayerDamage,
} from './engine/static-math.js';
export { createStaticFieldSampler } from './engine/static-field.js';
export type {
  StaticFieldSampler,
  StaticFieldResult,
  StaticFieldHit,
} from './engine/static-field.js';
export {
  nativeSamplePosition,
  resolveResampling,
  runStaticSampling,
} from './engine/sampling.js';
export type {
  NativeSampleState,
  ResamplingState,
  CollisionContext,
  CollisionRequest,
  CollisionResult,
  SamplingTrace,
  SamplingInput,
} from './engine/sampling.js';
export {
  createC4Predictor,
  predictStaticC4Outcome,
} from './engine/conditional.js';
export type {
  ConditionalOutcome,
  ConditionalScenario,
} from './engine/conditional.js';
export { compareSamplingTraces } from './qualification/stages.js';
export type { StageComparison } from './qualification/stages.js';
export { createStandingC4Predictor } from './engine/standing.js';
export type { StandingC4Input, StandingC4Outcome } from './engine/standing.js';
