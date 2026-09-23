/*  Wizard */
jQuery(function ($) {
	"use strict";
	//$('form#wrapped').attr('action', 'survey.php');
	$("form#wrapped button[name='process']").click(function () {
		if ($('form#wrapped')[0].checkValidity()) {
			var surveysingle = JSON.parse(sessionStorage.getItem("surveysingle"))
			var answers = {
				"q1": sessionStorage.getItem("q1"),
				"q2": sessionStorage.getItem("q2"),
				"q2bis": sessionStorage.getItem("q2bis"),
				"q3": sessionStorage.getItem("q3"),
				"q3bis": sessionStorage.getItem("q3bis"),
				"q4": sessionStorage.getItem("q4"),
				"q4bis": sessionStorage.getItem("q4bis"),
				"q55": sessionStorage.getItem("q55"),
				"q55bis": sessionStorage.getItem("q55bis"),
				"q55": sessionStorage.getItem("q66"),
				"q55bis": sessionStorage.getItem("q66bis"),
				"q5": sessionStorage.getItem("q5"),
				"q5bis": sessionStorage.getItem("q5bis"),
				"q6": sessionStorage.getItem("q6")
			}
			surveysingle.answers2 = answers
			console.log(surveysingle)
			axios.put('http://51.91.17.110:6608/surveysingles/'+surveysingle.id, surveysingle)
				.then(function (response) {
					// handle success
					if (response.statusText == 'OK') {
						var q1 = sessionStorage.getItem("q1")
						sessionStorage.removeItem("q1");
						sessionStorage.removeItem("q2");
						sessionStorage.removeItem("q2bis");
						sessionStorage.removeItem("q3");
						sessionStorage.removeItem("q3bis");
						sessionStorage.removeItem("q4");
						sessionStorage.removeItem("q4bis");
						sessionStorage.removeItem("q55");
						sessionStorage.removeItem("q55bis");
						sessionStorage.removeItem("q66");
						sessionStorage.removeItem("q66bis");
						sessionStorage.removeItem("q5");
						sessionStorage.removeItem("q5bis");
						sessionStorage.removeItem("q6");
						sessionStorage.removeItem("survesingle");
						if(q1 == 'Oui') {
							window.location.href = "./partage.html"
						} else {
							$("#section-survey").addClass("d-none");
							$("#section-survey").removeClass("d-flex");
							$("#section-finished").removeClass("d-none");
							$("#msg_alert").addClass('d-none')
							$("#msg_sat").removeClass('d-none')
						}
					} else {
						alert('erreur servuer !')
					}
				})
				.catch(function (error) {
					// handle error
					console.log(error);
				})
		}
	});
	$("#wizard_container").wizard({
		stepsWrapper: "#wrapped",
		submit: ".submit",
		beforeSelect: function (event, state) {
			if ($('input#website').val().length != 0) {
				return false;
			}
			if (!state.isMovingForward)
				return true;
			var inputs = $(this).wizard('state').step.find(':input');
			return !inputs.length || !!inputs.valid();
		}
	}).validate({
		errorPlacement: function (error, element) {
			if (element.is(':radio') || element.is(':checkbox')) {
				error.insertBefore(element.next());
			} else {
				error.insertAfter(element);
			}
		}
	});
	//  progress bar
	$("#progressbar").progressbar();
	$("#wizard_container").wizard({
		afterSelect: function (event, state) {
			let progress
			(state.stepsPossible > 1) ? progress = Math.floor(state.stepsComplete / state.stepsPossible * 100) : progress = Math.floor(state.stepsComplete / (state.stepsPossible + 1) * 100)
			$("#location").text(progress + " %");
			$("#progressbar").progressbar("value", progress);
		}
	});
	// Validate select
	$('#wrapped').validate({
		ignore: [],
		rules: {
			select: {
				required: true
			}
		},
		errorPlacement: function (error, element) {
			if (element.is('select:hidden')) {
				error.insertAfter(element.next('.nice-select'));
			} else {
				error.insertAfter(element);
			}
		}
	});
});

function reorder() {
	var divList = $(".wizard-step");
	divList.sort(function (a, b) {
		return $(a).data("order") - $(b).data("order")
	});
	$("#middle-wizard").html(divList);
}

// Summary 
function getVals(formControl, controlType) {
	switch (controlType) {
		case 'question_1':
			var item = {}
			var question = $("#q1 .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q1", reponse);
			break;

		case 'question_2':
			var item = {}
			var question = $("#q2 .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q2", reponse);
			break;

		case 'question_2bis':
			var item = {}
			var question = $("#q2bis .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q2bis", reponse);
			break;

		case 'question_3':
			var item = {}
			var question = $("#q3 .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q3", reponse);
			break;

		case 'question_3bis':
			var item = {}
			var question = $("#q3bis .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q3bis", reponse);
			break;			

		case 'question_4':
			var item = {}
			var question = $("#q4 .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q4", reponse);
			break;

		case 'question_4bis':
			var item = {}
			var question = $("#q4bis .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q4bis", reponse);
			break;	

		case 'question_55':
			var item = {}
			var question = $("#q55 .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q55", reponse);
			break;

		case 'question_55bis':
			var item = {}
			var question = $("#q55bis .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q55bis", reponse);
			break;

		case 'question_66':
			var item = {}
			var question = $("#q66 .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q66", reponse);
			break;

		case 'question_66bis':
			var item = {}
			var question = $("#q66bis .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q66bis", reponse);
			break;

		case 'question_5':
			var item = {}
			var question = $("#q5 .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q5", reponse);
			break;

		case 'question_5bis':
			var item = {}
			var question = $("#q5bis .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q5bis", reponse);
			break;

		case 'question_6':
			var item = {}
			var question = $("#q6 .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q6", reponse);
			break;

		case 'question_7':
			var item = {}
			var question = $("#q7 .main_question").text();
			var reponse = $(formControl).val();
			$("#q7bis_additional_message_label").val("")
			sessionStorage.setItem("q7", reponse);
			break;

		case 'question_7bis':
			var item = {}
			var question = $("#q7bis .main_question").text();
			var reponse = $(formControl).val();
			if(reponse != ''){
				$('input[name="question_7"]').prop('checked',false)		
			}
			sessionStorage.setItem("q7", reponse);
			break;		

		case 'question_8':
			var item = {}
			var question = $("#q8 .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q8", reponse);
			break;

		case 'question_9':
			var item = {}
			var question = $("#q9 .main_question").text();
			var reponse = $(formControl).val();
			sessionStorage.setItem("q9", reponse);
			break;
	}
}