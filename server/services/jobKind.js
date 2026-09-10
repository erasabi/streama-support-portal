const JOB_KIND_DOWNLOAD = "download"
const JOB_KIND_SUBTITLE_ACQUIRE = "subtitle_acquire"

function jobDetail(job) {
	return job && job.detail && typeof job.detail === "object" && !Array.isArray(job.detail)
		? job.detail
		: {}
}

function jobKind(job) {
	return jobDetail(job).kind === JOB_KIND_SUBTITLE_ACQUIRE
		? JOB_KIND_SUBTITLE_ACQUIRE
		: JOB_KIND_DOWNLOAD
}

function isSubtitleAcquireJob(job) {
	return jobKind(job) === JOB_KIND_SUBTITLE_ACQUIRE
}

function kindSql(kind) {
	const want = kind === JOB_KIND_SUBTITLE_ACQUIRE ? JOB_KIND_SUBTITLE_ACQUIRE : JOB_KIND_DOWNLOAD
	return `COALESCE(detail->>'kind', '${JOB_KIND_DOWNLOAD}') = '${want}'`
}

module.exports = {
	JOB_KIND_DOWNLOAD,
	JOB_KIND_SUBTITLE_ACQUIRE,
	jobDetail,
	jobKind,
	isSubtitleAcquireJob,
	kindSql,
}
