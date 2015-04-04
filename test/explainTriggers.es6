var util = require('util')

var common = require('../src/common')

var query = `
	SELECT
		students.name AS student_name,
		students.id AS student_id,
		assignments.name,
		assignments.value,
		scores.score
	FROM
		scores
	INNER JOIN assignments ON
		(assignments.id = scores.assignment_id)
	INNER JOIN students ON
		(students.id = scores.student_id)
	WHERE
		assignments.class_id = 1`
var params = [ ]

exports.explain = async function(test) {	
	try {
		var pgHandle = await common.getClient(process.env.CONN)
		var details = await common.getQueryDetails(pgHandle.client, query, params)
	}
	catch(err) {
		console.error(err)
	}
	console.log(util.inspect(details, { depth: null }))
	test.ok(123)

	pgHandle.done()
	test.done()
}
