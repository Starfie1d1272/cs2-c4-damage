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
