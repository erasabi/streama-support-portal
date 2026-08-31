"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		const table = await queryInterface.describeTable("PipelineJobs")
		if (!table.seasons) {
			await queryInterface.addColumn("PipelineJobs", "seasons", {
				type: Sequelize.JSONB,
				allowNull: true,
			})
		}
	},

	down: async (queryInterface) => {
		await queryInterface.removeColumn("PipelineJobs", "seasons").catch(() => {})
	},
}
