// Merge-only PipelineJob.ledger. Paths never shrink; leftoverMissing may
// replace the remaining episode list. Pure helpers so tests need no DB.

const PATH_STAGES = ["download", "encode", "upload"]
const MAX_PATHS = 500

function emptyAttempts() {
	return { add: 0, leftoverRetry: 0 }
}

function asStringArray(value) {
	if (!Array.isArray(value)) return null
	const out = []
	const seen = new Set()
	for (const item of value) {
		const s = String(item == null ? "" : item).trim()
		if (!s || seen.has(s)) continue
		seen.add(s)
		out.push(s)
	}
	return out
}

function unionStrings(existing, incoming, max = MAX_PATHS) {
	const seen = new Set()
	const out = []
	for (const list of [existing, incoming]) {
		if (!Array.isArray(list)) continue
		for (const raw of list) {
			const s = String(raw == null ? "" : raw).trim()
			if (!s || seen.has(s)) continue
			seen.add(s)
			out.push(s)
			if (out.length >= max) return out
		}
	}
	return out
}

function namesFromBucket(bucket) {
	if (!bucket || typeof bucket !== "object") return []
	const names = []
	for (const key of ["files", "subtitles"]) {
		if (!Array.isArray(bucket[key])) continue
		for (const entry of bucket[key]) {
			if (typeof entry === "string") {
				const name = entry.trim()
				if (name) names.push(name)
			} else if (entry && typeof entry === "object" && entry.name) {
				const name = String(entry.name).trim()
				if (name) names.push(name)
			}
		}
	}
	return names
}

function fileNamesFromArtifacts(artifacts) {
	const paths = { download: [], encode: [], upload: [] }
	if (!artifacts || typeof artifacts !== "object") return paths
	for (const stage of PATH_STAGES) {
		paths[stage] = namesFromBucket(artifacts[stage])
	}
	return paths
}

function mergeAttempts(existing, incoming) {
	const base =
		existing && typeof existing === "object" && !Array.isArray(existing)
			? { ...emptyAttempts(), ...existing }
			: emptyAttempts()
	if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) {
		return base
	}
	const out = { ...base }
	for (const [key, value] of Object.entries(incoming)) {
		if (typeof value === "number" && Number.isFinite(value)) {
			const prev = typeof out[key] === "number" && Number.isFinite(out[key]) ? out[key] : 0
			out[key] = Math.max(prev, value)
		} else if (value != null) {
			out[key] = value
		}
	}
	return out
}

/**
 * Merge a progress tick onto the stored job ledger. Missing keys are ignored.
 * `detail.leftoverMissing` replaces `missing` (remaining work). `detail.missing`
 * unions. Path lists only grow.
 */
function mergePipelineLedger(existing, incoming = {}) {
	const prev =
		existing && typeof existing === "object" && !Array.isArray(existing)
			? existing
			: {}
	const prevPaths =
		prev.paths && typeof prev.paths === "object" && !Array.isArray(prev.paths)
			? prev.paths
			: {}
	const detail =
		incoming.detail &&
		typeof incoming.detail === "object" &&
		!Array.isArray(incoming.detail)
			? incoming.detail
			: {}

	const leftover = asStringArray(detail.leftoverMissing)
	const missingSeed = asStringArray(detail.missing)
	let missing
	if (leftover) {
		missing = leftover
	} else if (missingSeed) {
		missing = unionStrings(prev.missing, missingSeed)
	} else if (Array.isArray(prev.missing)) {
		missing = [...prev.missing]
	} else {
		missing = []
	}

	const fromArtifacts = fileNamesFromArtifacts(incoming.artifacts)
	const paths = {}
	for (const stage of PATH_STAGES) {
		paths[stage] = unionStrings(prevPaths[stage], fromArtifacts[stage])
	}

	let lastError = prev.lastError != null ? prev.lastError : null
	if (Object.prototype.hasOwnProperty.call(detail, "error")) {
		lastError =
			detail.error == null || detail.error === ""
				? null
				: typeof detail.error === "string"
					? detail.error
					: String(detail.error)
	}

	const nextHash = incoming.infoHash || detail.infoHash || prev.infoHash || null

	return {
		infoHash: nextHash ? String(nextHash) : null,
		missing,
		paths,
		attempts: mergeAttempts(prev.attempts, detail.attempts),
		lastError,
	}
}

module.exports = {
	MAX_PATHS,
	PATH_STAGES,
	mergePipelineLedger,
	unionStrings,
	fileNamesFromArtifacts,
}
