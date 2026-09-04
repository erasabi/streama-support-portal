"use strict"

module.exports = {
	up: async (queryInterface, Sequelize) => {
		const table = await queryInterface.describeTable("PipelineJobs")
		if (!table.ledger) {
			await queryInterface.addColumn("PipelineJobs", "ledger", {
				type: Sequelize.JSONB,
				allowNull: true,
			})
		}
	},

	down: async (queryInterface) => {
		await queryInterface.removeColumn("PipelineJobs", "ledger").catch(() => {})
	},
}
