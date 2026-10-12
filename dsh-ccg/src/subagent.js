/** Bridge the rc one-shot/continuable API and the alpha activation API. */
export function usesActivations(subagents) {
  return typeof subagents?.startActivation === 'function'
}

/** Collect a caller-delivered answer and release its exact run, even on failure. */
export async function collectSubagentResult(subagents, provider, request) {
  const { label, signal, ...body } = request
  signal?.throwIfAborted()
  const run = usesActivations(subagents)
    ? await subagents.startActivation({ provider, label, request: body, signal, delivery: 'caller' })
    : await subagents.start(provider, request)

  // Alpha's startup signal stops owning the run after publication. Retain the
  // receipt and forward later cancellation to dispose(), once per activation.
  let disposal
  const dispose = () => {
    disposal ??= Promise.resolve().then(() => run.dispose())
    // An abort event cannot await; the finally path below reports its failure.
    disposal.catch(() => {})
    return disposal
  }
  const abort = () => { void dispose() }
  signal?.addEventListener('abort', abort, { once: true })
  if (signal?.aborted) abort()

  let result
  let failure
  try {
    result = await run.result
    signal?.throwIfAborted()
  } catch (error) {
    failure = error
  } finally {
    signal?.removeEventListener('abort', abort)
    try {
      await dispose()
    } catch (error) {
      // A teardown failure must not hide the original execution failure.
      failure ??= error
    }
  }
  if (failure !== undefined) throw failure
  return result
}

/** Start a resident teammate; its answer belongs to the parent notification. */
export function startTeammate(subagents, spec) {
  return usesActivations(subagents)
    ? subagents.startActivation({ ...spec, delivery: 'parent' })
    : subagents.startContinuable(spec)
}

/** New catalogs carry identity only; recursive discovery carries live activity. */
export async function directChildActivity(subagents, parentId, signal) {
  if (typeof subagents?.listDescendants === 'function') {
    const rows = await subagents.listDescendants(parentId, signal)
    return rows.filter(row => row.kind === 'child' && row.depth === 1)
  }
  return subagents.listChildren(parentId, signal)
}
