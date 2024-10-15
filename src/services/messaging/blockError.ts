export class BlockError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BlockError'
  }
}
