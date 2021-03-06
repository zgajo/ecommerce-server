const { hash } = require('bcrypt');
const crypto = require('crypto');
const { OAuth2Client } = require('google-auth-library');

const { client } = require('../../utils/redis');

const { sendNewUserMail } = require('../../utils/email');
const { asyncAction } = require('../../utils/globals');

module.exports = {
	signupCustomer: async (_, { input }, { models }) => {
		try {
			// taking all fields except password_confirm, to store them to db later
			const { password_confirm, ...data } = input;
			const { email, name, password } = data;

			//1: check if user with same email alnpmready in db
			const userExists = await models.Customer.findOne({ where: { email } });

			if (userExists) {
				return {
					message: 'User already exists',
					success: false,
				};
			}

			// 2. check for password
			if (!password || password.length < 6 || password.length > 20) {
				return {
					message: 'Password is not in required characters range',
					success: false,
				};
			}

			// 3. check if pasword is same as confirm_password
			if (password !== password_confirm) {
				return {
					message: 'Password and confirm passwords are not the same',
					success: false,
				};
			}

			//4. create token to store user later, user has 1h to confirm email
			const resetPasswordToken = crypto.randomBytes(20).toString('hex');

			// 5. store user data to redis, with key of hashed token, and token expires with token
			client.set(
				`signup:token:${resetPasswordToken}`,
				JSON.stringify({
					...data,
					password: await hash(password_confirm, 10),
				}),
				'EX',
				3600,
			);

			// 6. send data for confirmation of email address
			await sendNewUserMail(name, email, resetPasswordToken);

			return {
				message: `Email sent to ${email}. Please confirm email.`,
				success: true,
			};
		} catch (error) {
			return {
				message: error.message,
				success: false,
			};
		}
	},
	signupCustomerConfirm: async (_, { token }, { models }) => {
		const data = JSON.parse(await client.getAsync(`signup:token:${token}`));

		if (!data) {
			return {
				message: 'Token not found',
				success: false,
			};
		}

		const [, user] = await asyncAction(models.Customer.findOne({ where: { email: data.email } }));

		if (user) {
			return {
				message: 'User already exists',
				success: false,
			};
		}

		const [err, createdUser] = await asyncAction(models.Customer.create(data));

		if (err) {
			return {
				message: err,
				success: false,
			};
		}

		if (createdUser) {
			client.del(`signup:token:${token}`);
			return {
				message: 'User created!',
				success: true,
			};
		}
	},
	signupCustomerGoogle: async (_, { googleAuthToken }, { models }) => {
		const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
		async function verify() {
			const ticket = await client.verifyIdToken({
				audience: process.env.GOOGLE_CLIENT_ID, // Specify the CLIENT_ID of the app that accesses the backend
				idToken: googleAuthToken,
				// Or, if multiple clients access the backend:
				//[CLIENT_ID_1, CLIENT_ID_2, CLIENT_ID_3]
			});
			const payload = ticket.getPayload();
			// console.log(payload.aud === );
			if (payload.aud === process.env.GOOGLE_CLIENT_ID) {
				const { email, sub, email_verified, name } = payload;

				if (!email_verified) {
					return {
						message: 'Google email is not verified by Google',
						success: false,
					};
				}

				//1: check if user with same email alnpmready in db
				const userExists = await models.Customer.findOne({ where: { email } });

				if (userExists) {
					return {
						message: 'User already exists',
						success: false,
					};
				}

				await models.Customer.create({
					email,
					google_id: sub,
					method: 'google',
					name,
				});

				return {
					message: 'Account succesfully created',
					success: true,
				};
			}
		}

		return verify()
			.then(res => res)
			.catch(err => err);
	},
};
