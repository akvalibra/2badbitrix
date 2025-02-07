import range from 'lodash.range'
import { Command } from '../../commands.js'
import { ListableMethod, MethodParams, MethodPayloadType } from '../../methods.js'
import { BatchPayload, ListPayload } from '../../payloads.js'
import { Batch } from './batch.js'
import { Call } from './call.js'

const MAX_ENTRIES_PER_COMMAND = 50

/**
 * Generates required amount of commands to process specified amount of entries
 */
export const fillWithCommands = <C extends Command>(
  { method, params }: C,
  start: number,
  toProcess: number,
  entriesPerCommand: number
): ReadonlyArray<{ readonly method: C['method'], readonly params?: C['params'] }> => {
  const requiresCommands = Math.ceil((toProcess - start) / entriesPerCommand)

  return range(0, requiresCommands)
    .map((i) => ({ method, params: { ...params, start: start + (entriesPerCommand * i) } }))
}

/**
 * Get the highest value from object or an array if there's any
 */
export const highest = (
  input: ReadonlyArray<number | undefined> | Record<string, number | undefined>
): number | undefined =>
  Object.values(input).reduce(
    (a, b) => a !== undefined && b !== undefined
      ? a > b ? a : b
      : a !== undefined && b === undefined
        ? a
        : a === undefined && b !== undefined
          ? b
          : undefined
    , undefined)

/**
 * Converts batch payload to a list payload
 */
// export const batchToListPayload = <P>(payload: BatchPayload<Record<string, P> | readonly P[]>): ListPayload<P> => {
//   // eslint-disable-next-line @typescript-eslint/naming-convention
//   const { result: { result, result_total, result_error, result_next }, time } = payload

//   const flattenResult = Object.entries(result).reduce<readonly P[]>(
//     // @ts-expect-error ignore this for now
//     (flatten, [_key, r]) => !r ? flatten : [...flatten, ...r]
//     , [])

//   return {
//     error: Object.values(result_error).join('\n'),
//     next: highest(result_next),
//     result: flattenResult,
//     // @todo Not accurate, we do not care
//     time,
//     total: highest(result_total) ?? 0
//   }
// }
export const batchToListPayload = <P>(payload: BatchPayload<Record<string, P> | readonly P[]>): ListPayload<P> => {
  // eslint-disable-next-line @typescript-eslint/naming-convention
  const { result: { result, result_total, result_error, result_next }, time } = payload

  const flattenResult = Object.values(result).flatMap((entityResult) => {
    if (Array.isArray(entityResult)) {
      return entityResult;
    } else if (
      typeof entityResult === "object" &&
      entityResult !== null &&
      "items" in entityResult &&
      Array.isArray((entityResult as any).items)  // Use 'any' to avoid TypeScript error
    ) {
      return (entityResult as any).items;
    } else {
      return [entityResult as P];
    }
  });

  return {
    error: Object.values(result_error).join('\n'),
    next: highest(result_next),
    result: flattenResult,
    // @todo Not accurate, we do not care
    time,
    total: highest(result_total) ?? 0
  }
}


type Dependencies = {
  readonly call: Call
  readonly batch: Batch
}

export type List = <M extends ListableMethod>(
  method: M,
  params: MethodParams<M>
) => Promise<ListPayload<MethodPayloadType<M>>>

/**
 * Gets all entries by dispatching required amount of requests. Will fill figure out payload type based on the Method.
 */
export default ({ call, batch }: Dependencies): List => {
  const list: List = async <M extends ListableMethod>(
    method: M,
    params: MethodParams<M>
  ): Promise<ListPayload<MethodPayloadType<M>>> => {
    const start = params.start ?? 0

    const listAll = async () => {
      const batchCommands = fillWithCommands({ method, params }, start, firstCall.total, MAX_ENTRIES_PER_COMMAND)
      const payload = await batch(batchCommands)

      // @ts-expect-error ignore this for now
      return batchToListPayload(payload)
    }

    const firstCall = await call(method, { ...params, start })

    return !firstCall.next ? firstCall : await listAll()
  }

  return list
}
