export type Deferred<T> = {
  promise: Promise<T>
  resolve: (value: T) => void
  reject: (reason?: unknown) => void
}

export function createDeferred<T>(): Deferred<T> {
  // No cleaner way to do this without inducing additional runtime work
  // eslint-disable-next-line @typescript-eslint/no-unsafe-type-assertion
  const deferred = {} as unknown as Deferred<T>

  deferred.promise = new Promise<T>((resolve, reject) => {
    deferred.resolve = resolve
    deferred.reject = reject
  })
  return deferred
}
