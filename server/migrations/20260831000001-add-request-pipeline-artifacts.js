"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		const table = await queryInterface.describeTable("Requests")
		if (!table.pipelineArtifacts) {
			await queryInterface.addColumn("Requests", "pipelineArtifacts", {
				type: Sequelize.JSONB,
				allowNull: true,
			})
		}
	},

	down: async (queryInterface) => {
		await queryInterface.removeColumn("Requests", "pipelineArtifacts").catch(() => {})
	},
}
