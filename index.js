/* jshint node:true */

'use strict';

var _ = require('lodash');
var assert = require('assert');

var koaFramework = require('koa-framework');

module.exports = function(options) {
	var queueServer = options.katar;
	var port = parseInt(options.port, 10);

	assert(queueServer, 'Missing queue server');
	assert(!isNaN(port), 'Missing or invalid port');

	var app = koaFramework.app()
		.createServer(options.port, options.host)
		.addApi('v1');

	/**
		Custom methods that add additional functionality

		Queue config lets the application create configuration profile that are sent to workers
			- Interval is a required parameter and indicates how often a client should poll the server
			- Any other arbitrary config can also be added and is sent to the client when client asks for configuration settings
	 */
	var DEFAULT_CONFIG = {
		interval: 30 * 1000, // 30 seconds
	};
	var queueConfig = {};
	var workerServer = {
		DEFAULT_CONFIG: DEFAULT_CONFIG,
		router: app.api.v1.router,
		config: function(queue, config) {
			// client can pass both a queue instance or the queue name
			var queueInstance = queue.name ? queue : queueServer.queue(queue);
			if (arguments.length > 1) {
				assert(queueInstance, 'Queue not found');
				queueConfig[queueInstance.name] = _.defaults(config, DEFAULT_CONFIG);
			}
			// a queue might be declared on the queue server, but its config doesnt have to be declared
			// ensures default config is always returned if custom config doesnt exist
			queueConfig[queueInstance.name] = queueConfig[queueInstance.name] || DEFAULT_CONFIG;
			return queueConfig[queueInstance.name];
		}
	};


	/**
		Simple middleware that ensures that the queue id is valid

		If the queue is valid, it is added to the context
	 */
	function assertQueue(ctx) {
		var queue = queueServer.queue(ctx.params.queue);
		if (!queue) { ctx.throw(404, 'Queue not found'); }
		ctx.queue = queue;
	}

	/**
		Middleware for retrieving next task in the queue and sending that to the user
	 */
	function *sendNextTask(ctx) {
		var task = yield *ctx.queue.next();
		if (task) { yield *ctx.queue.started(task._id); }

		if (!task) {
			ctx.status = 204; // no content
		} else {
			// wrap in an array to future proof for when we want to implement concurrency
			ctx.body = { tasks: [task] };
		}

		return task;
	}

	/**
		Returns the configuration associated with the respective queue
	 */
	app.api.v1.router.get('/queue/:queue', function *() {
		// ensure queue is valid
		assertQueue(this);
		this.body = { configuration: workerServer.config(this.queue.name) };
	});

	app.api.v1.router.post('/queue/:queue', function *() {
		var task;

		// ensure queue is valid
		assertQueue(this);

		var body = this.request.body;
		body.tasks = body.tasks || [];

		// if the user submitted a task that has been completed, mark it as done
		for (var i = 0, len = body.tasks.length; i < len; i += 1) {
			task = body.tasks[i];
			yield *this.queue[task.status](task._id, task.error);
		}

		// send down next task
		yield *sendNextTask(this);
	}, {
		schema: {
			body: {
				tasks: {
					type: 'array',
					items: {
						_id: { type: 'string', required: true },
						status: { type: 'string', required: true, enum: ['done', 'failed'] },
						error: { type: 'string' }
					}
				}
			},
			options: { strict: false }
		},
		parse: 'json'
	});

	app.ready();

	/**
		Print a friendly message that indicates the URL that queues are available at
	 */
	console.log('\nHTTP server for queue workers\n');
	console.log('Available routes: ');
	Object.keys(queueServer.queues).forEach(function(queueName) {
		console.log('%s: %s', queueName, '/v1/queue/' + queueName);
	});

	return workerServer;
};