Incoming Workers Server for Queue
=================================

Creates a HTTP server that binds to a katar server and listens for incoming workers to:
- Distribute tasks to workers
- Update tasks on the queue

The worker does not need to be written in node.js. It can be written in any language and on any platform that is able to do HTTP requests.



Usage
-----

```js
// create a katar queue server with default configuration
var katar = require('katar')();
// create a dummy queue
var queue = katar.queue('queue', { persistent: false });

// create a server that workers can poll to fetch jobs
var workerServer = require('http-queue-worker')({
	katar: katar, // required
	port: 3000, // required
	host: host // optional
});

// let the workers know:
// - they should poll for jobs in this queue every 1000 milliseconds
// - the custom configuration required to execute jobs
workerServer.config(queue, { interval: 1000, custom: 'config' });
```



Authentication
--------------

Authentication is not supported currently. This is a big security risk if workers are not in an isolated network segment. This will be fixed in a future release.



Routes
------

### Get configuration ###

#### Request

```
GET /v1/queue/:queue
```

#### Response

A json payload is returned that contains the interval at which the worker should poll the server and any other custom application level configuration.

```js
// 10 seconds, specified in milliseconds
{
	configuration: {
		interval: 10000,
		some: 'other',
		data: { can: { go: 'here' } },
	}
}
```


### Poll for next queued task

#### Request

```
POST /v1/queue/:queue

{}
```

#### Response

The server sends a `204 No Content` status code if there are no more tasks to execute

Otherwise, the server will send a JSON payload with a `200 OK` status code. The returned response is an array of tasks that have been assigned to the worker. Currently, only one task at a time is supported due to a limitation in katar.

```
{
	tasks: [{ _id: 1, data: 'data' }]
}
```


### Mark a job as done

The exact same route can be used to specify when a task has been completed. Upon receiving the request, the server will issue a new task or return `204 No Content`.

#### Reuest

```
POST /v1/queue/:queue

{
	tasks: [
	 { _id: 'abc', status: 'done' },
	 { _id: 'def', status: 'failed', error: 'some error' }
	]
}
```

### Response

The server sends a `204 No Content` status code if there are no more tasks to execute

Otherwise, the server will send a JSON payload with a `200 OK` status code and a list of tasks. See "Poll for next queued task" above for a description of the response.


Configuration
-------------

Application specific configuration to be sent down to workers for each of the queues. Any arbitrary configuration settings can be set based on the requirements of the application.

### Polling interval

The only required configuration setting is `interval` which lets the workers know how often they should poll the server. By default, a 30 second interval is specified.

### Example

```js
// create a katar queue server with default configuration
var katar = require('katar')();
// create a dummy queue
var queue = katar.queue('queue', { persistent: false });

// create a server that workers can poll to fetch jobs
var workerServer = require('http-queue-worker')({
	katar: katar, // required
	port: 3000, // required
	host: host // optional
});

// queue configuration settings
workerServer.config(queue, {
	interval: 1000,
	custom: 'config',
	some: {
		more: 'config'
	},
	date: new Date()
});
```


Clients
-------

Clients that interact with the server can be written in any language. Simply call a `GET` method to get the queue configuration, then send `POST` requests to fetch new jobs or mark jobs as done/failed.



Changelog
---------

### v0.0.1 - Alpha
- Initial commit