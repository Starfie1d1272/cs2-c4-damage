export type {
  Vec3,
  FieldMetadata,
  Bombsite,
  FieldRecord,
  BombDamageField,
} from './field/types.js';
export type {
  NumericRange,
  C4Outcome,
  PredictC4Input,
} from './engine/types.js';
export { outcomeFromDamageRange, predictC4Outcome } from './engine/outcome.js';
