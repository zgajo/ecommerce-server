const fs = require('fs');
const path = require('path');
const basename = path.basename(__filename);
const { capitalize } = require('../utils/globals');
const Sequelize = require('sequelize');

// TODO: Use Redis for catching, store into redis on Sequelize hooks
const sequelize = new Sequelize(process.env.DB_NAME, process.env.DB_USERNAME, process.env.DB_PASSWORD, {
	define: {
		freezeTableName: true,
		timestamps: false,
		underscored: true,
	},
	dialect: 'mysql',
	host: process.env.DB_HOST,
	operatorsAliases: Sequelize.Op, // to ger rid of Sequelize depricate error message
});

const models = {};
fs.readdirSync(__dirname)
	.filter(file => {
		return file.indexOf('.') !== 0 && file !== basename && file.slice(-3) === '.js';
	})
	.forEach(file => {
		const model = sequelize['import'](path.join(__dirname, file));
		let modelName = model.name;
		modelName = capitalize(modelName);
		models[modelName] = model;
	});

Object.keys(models).forEach(modelName => {
	if ('associate' in models[modelName]) {
		models[modelName].associate(models);
	}
});

models.sequelize = sequelize;
models.Sequelize = Sequelize;

models.op = Sequelize.Op;

module.exports = models;
