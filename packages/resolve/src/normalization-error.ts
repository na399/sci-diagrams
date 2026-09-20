/** An expected, input-caused validation failure from a trusted profile normalizer. */
export class NormalizationError extends Error {
  readonly path: string;

  constructor(message: string, path = '') {
    super(message);
    this.name = 'NormalizationError';
    this.path = path;
  }
}
