const STAGES = ["download", "encode", "upload"]
const MAX_FILES = 500

function kindFromName(name) {
	const lower = String(name || "").toLowerCase()
	if (
		lower.endsWith(".srt") ||
		lower.endsWith(".vtt") ||
		lower.endsWith(".ass") ||
		lower.endsWith(".ssa")
	) {
		return "subtitle"
	}
	return "video"
}

function normalizeFile(entry) {
	if (entry == null) return null
	if (typeof entry === "string") {
		const name = entry.trim()
		if (!name) return null
		return { name, kind: kindFromName(name) }
	}
	if (typeof entry !== "object") return null
	const name = String(entry.name || "").trim()
	if (!name) return null
	const out = { name }
	if (entry.kind === "video" || entry.kind === "subtitle") {
		out.kind = entry.kind
	} else {
		out.kind = kindFromName(name)
	}
	if (entry.bytes != null && Number.isFinite(Number(entry.bytes))) {
		out.bytes = Math.max(0, Math.floor(Number(entry.bytes)))
	}
	if (entry.language) {
		out.language = String(entry.language).toLowerCase()
	}
	return out
}

function mergeFileList(existing, incoming) {
	const byName = new Map()
	for (const raw of existing || []) {
		const file = normalizeFile(raw)
		if (file) byName.set(file.name, file)
	}
	for (const raw of incoming || []) {
		const file = normalizeFile(raw)
		if (!file) continue
		const prev = byName.get(file.name)
		if (!prev) {
			byName.set(file.name, file)
		} else {
			byName.set(file.name, {
				...prev,
				...file,
				name: prev.name,
				kind: file.kind || prev.kind,
				bytes: file.bytes != null ? file.bytes : prev.bytes,
				language: file.language || prev.language,
			})
		}
	}
	return [...byName.values()]
		.sort((a, b) => a.name.localeCompare(b.name))
		.slice(0, MAX_FILES)
}

function bucketHasContent(bucket) {
	if (!bucket || typeof bucket !== "object") return false
	if (typeof bucket.folderName === "string" && bucket.folderName.trim()) {
		return true
	}
	if (typeof bucket.torrentName === "string" && bucket.torrentName.trim()) {
		return true
	}
	if (Array.isArray(bucket.files) && bucket.files.length) return true
	if (Array.isArray(bucket.subtitles) && bucket.subtitles.length) return true
	return false
}

function mergeStageBucket(existing, incoming) {
	if (!bucketHasContent(incoming)) return existing || undefined
	const out = { ...(existing && typeof existing === "object" ? existing : {}) }
	if (typeof incoming.folderName === "string" && incoming.folderName.trim()) {
		out.folderName = incoming.folderName.trim()
	}
	if (typeof incoming.torrentName === "string" && incoming.torrentName.trim()) {
		out.torrentName = incoming.torrentName.trim()
	}
	if (Array.isArray(incoming.files) && incoming.files.length) {
		out.files = mergeFileList(out.files, incoming.files)
	}
	if (Array.isArray(incoming.subtitles) && incoming.subtitles.length) {
		out.subtitles = mergeFileList(out.subtitles, incoming.subtitles)
	}
	return out
}

function artifactsHaveContent(incoming) {
	if (!incoming || typeof incoming !== "object") return false
	return STAGES.some((stage) => bucketHasContent(incoming[stage]))
}

/**
 * Union per-stage file inventories. Never shrinks a list; empty ticks are ignored.
 */
function mergePipelineArtifacts(existing, incoming) {
	if (!artifactsHaveContent(incoming)) {
		return existing && typeof existing === "object" ? existing : null
	}
	const base = existing && typeof existing === "object" ? existing : {}
	const out = { ...base }
	for (const stage of STAGES) {
		if (!bucketHasContent(incoming[stage])) continue
		out[stage] = mergeStageBucket(base[stage], incoming[stage])
	}
	return out
}

module.exports = {
	MAX_FILES,
	kindFromName,
	mergePipelineArtifacts,
	artifactsHaveContent,
}
