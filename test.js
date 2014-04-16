/* jshint node:true */
/* globals describe, beforeEach, it */

'use strict';

var co = require('co');
var chai = require('chai');
var should = chai.should();
var request = require('request');

describe('#queue-worker-http', function() {
	var katar = require('katar')();
	var queueName = 'test';
	var apiVersion = 'v1';
	var port = 30000;
	var host = 'localhost';
	var url = 'http://' + host + ':' + port + '/' + apiVersion + '/queue/' + queueName;
	var queue = katar.queue(queueName, { persistent: false });
	var httpQueueWorker = require(__dirname)({ katar: katar, port: port, host: host });

	beforeEach(function(done) {
		co(function* () {
			yield *queue.clear();
		})(done);
	});

	describe('#config', function() {
		it('should return 404 if queue name is invalid', function(done) {
			request(url.replace('test', 'boom'), function(err, res, body) {
				should.not.exist(err);
				res.statusCode.should.equal(404);
				body.should.eql('Queue not found');
				done();
			});
		});

		it('should return default config if config doesnt exist', function(done) {
			request(url, function(err, res, body) {
				should.not.exist(err);
				res.statusCode.should.equal(200);
				JSON.parse(body).should.eql({
					configuration: { interval: 30000 }
				});
				done();
			});
		});

		it('should return config for GET requests', function(done) {
			httpQueueWorker.config('test', { interval: 10000, custom: 'message' });
			request(url, function(err, res, body) {
				should.not.exist(err);
				res.statusCode.should.equal(200);
				JSON.parse(body).should.eql({
					configuration: { interval: 10000, custom: 'message' }
				});
				done();
			});
		});

		it('should allow setting config with a queue instance rather than queue id', function(done) {
			httpQueueWorker.config(queue, { interval: 20000, custom: 'something' });
			request(url, function(err, res, body) {
				should.not.exist(err);
				res.statusCode.should.equal(200);
				JSON.parse(body).should.eql({
					configuration: { interval: 20000, custom: 'something' }
				});
				done();
			});
		});
	});

	describe('#next', function() {
		it('should return 404 if queue name is invalid', function(done) {
			request.post({
				url: url.replace('test', 'boom'),
				json: {}
			}, function(err, res, body) {
				should.not.exist(err);
				res.statusCode.should.equal(404);
				body.should.eql({ error: 'Queue not found' });
				done();
			});
		});

		it('should return 204 if there are no tasks in the queue', function(done) {
			request.post({
				url: url,
				json: {}
			}, function(err, res, body) {
				should.not.exist(err);
				res.statusCode.should.equal(204);
				should.not.exist(body);
				done();
			});
		});

		it('should return 204 if no eligible tasks are in the queue', function(done) {
			co(function *() {
				return yield *queue.insert([
					{ data: 'data1', status: 'done' },
					{ data: 'data2', status: 'paused' }
				]);
			})(function(err) {
				should.not.exist(err);
				request.post({
					url: url,
					json: {}
				}, function(err, res, body) {
					should.not.exist(err);
					res.statusCode.should.equal(204);
					should.not.exist(body);
					done();
				});
			});
		});

		it('should return 200 and an eligible task', function(done) {
			co(function *() {
				return yield *queue.insert([
					{ data: 'data1', status: 'done' },
					{ data: 'data2', status: 'paused' },
					{ data: 'data2', status: 'queued' }
				]);
			})(function(err, tasks) {
				should.not.exist(err);
				request.post({
					url: url,
					json: {},
				}, function(err, res, body) {
					should.not.exist(err);
					res.statusCode.should.equal(200);
					body.should.eql({
						tasks: [{ _id: tasks[2]._id, data: tasks[2].data }]
					});
					done();
				});
			});
		});

		describe('#done', function() {
			var tasks;

			beforeEach(function(done) {
				co(function *() {
					tasks = yield *queue.insert([
						{ data: 'data1', status: 'paused' },
						{ data: 'data2', status: 'in progress' },
						{ data: 'data3', status: 'queued' }
					]);
				})(done);
			});

			it('should return 500 if task id is invalid', function(done) {
				request.post({
					url: url,
					json: {
						tasks: [{ _id: '123', status: 'done' }]
					}
				}, function(err, res) {
					should.not.exist(err);
					res.statusCode.should.equal(500);
					done();
				});
			});

			it('should return 500 if body format is not json', function(done) {
				request.post({ url: url, form: {} }, function(err, res) {
					should.not.exist(err);
					res.statusCode.should.equal(400);
					done();
				});
			});

			it('should return 500 if task status is invalid', function(done) {
				request.post({
					url: url,
					json: {
						tasks: [{ status: 'queued', _id: tasks[1]._id }]
					}
				}, function(err, res, body) {
					should.not.exist(err);
					res.statusCode.should.equal(500);
					done();
				});
			});

			it('should return 500 if task status is failed but no error is given', function(done) {
				request.post({
					url: url,
					json: {
						tasks: [{ status: 'failed', _id: tasks[1]._id }]
					}
				}, function(err, res, body) {
					should.not.exist(err);
					res.statusCode.should.equal(500);
					done();
				});
			});

			it('should return 204 if current task is marked as error and there are no more pending tasks', function(done) {
				co(function *() {
					yield *queue.done(tasks[2]._id);
				})(function(err) {
					should.not.exist(err);
					request.post({
						url: url,
						json: {
							tasks: [
								{ _id: tasks[1]._id, status: 'failed', error: 'some error' }
							]
						}
					}, function(err, res) {
						should.not.exist(err);
						res.statusCode.should.equal(204);
						done();
					});
				});
			});

			it('should return 200 if there is an eligible task', function(done) {
				request.post({
					url: url,
					json: {
						tasks: [
							{ _id: tasks[1]._id, status: 'failed', error: 'some error' }
						]
					}
				},
				function(err, res, body) {
					should.not.exist(err);
					res.statusCode.should.equal(200);
					body.should.eql({
						tasks: [{ _id: tasks[2]._id, data: tasks[2].data }]
					});
					done();
				});
			});
		});
	});
});