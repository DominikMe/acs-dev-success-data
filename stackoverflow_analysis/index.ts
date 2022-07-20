import { AzureFunction, Context, HttpRequest } from "@azure/functions"
import fetch from "node-fetch";

const httpTrigger: AzureFunction = async function (context: Context, req: HttpRequest): Promise<void> {
    context.log('HTTP trigger function processed a request.');
    const name = (req.query.name || (req.body && req.body.name));
    const responseMessage = name
        ? "Hello, " + name + ". This HTTP triggered function executed successfully."
        : "This HTTP triggered function executed successfully. Pass a name in the query string or in the request body for a personalized response.";

    const analysis = await analyze("azure-communication-services", 60, 3);

    context.res = {
        // status: 200, /* Defaults to 200 */
        body: analysis
    };

};

export default httpTrigger;

const baseUrl = "https://api.stackexchange.com/2.3/";
const buildQuestionsUrl = (tag: string, fromDate: Date, toDate: Date) => `${baseUrl}questions?pagesize=100&fromdate=${Math.round(+fromDate / 1000)}&todate=${Math.round(+toDate / 1000)}&order=desc&sort=creation&tagged=${tag}&site=stackoverflow`;
const buildAnswersUrl = (questionId) => `${baseUrl}questions/${questionId}/answers?order=desc&sort=activity&site=stackoverflow`;

const getAcceptedAnswer = async (questionId) => {
    const url = buildAnswersUrl(questionId);
    const response = await fetch(url);
    const data = await response.json() as any;
    if (!data.items) return null;

    for (const a of data.items) {
        if (a.is_accepted) {
            return a;
        }
    }
    return null;
}

const isStaff = (userId) => {
    return true;
}

const percent = (n: number) => Math.round(n * 100);

const analyzeQuestionsResponse = async (response) => {
    const items = response.items;
    if (!items || items.length === 0) return {};

    let result = {
        questions_count: 0,
        questions_with_answers_count: 0,
        questions_with_answers_percentage: 0,
        questions_with_accepted_answer_count: 0,
        questions_with_accepted_answer_percentage: 0,
        total_view_count: 0,
        answered_by_staff_count: 0,
        answered_by_staff_percentage: 0,
        answered_by_community_count: 0,
        answered_by_community_percentage: 0,
    };

    for (const q of items) {
        result.questions_count++;
        result.total_view_count += q.view_count;
        if (q.answer_count > 0) {
            result.questions_with_answers_count++;
            const accepted = await getAcceptedAnswer(q.question_id);
            if (accepted) {
                result.questions_with_accepted_answer_count++;
                if (isStaff(accepted.owner.user_id)) {
                    result.answered_by_staff_count++;
                };
            }
        }
    }

    if (result.questions_with_answers_count > 0) {
        // compute percentages, hack: don't query has_more for paging but just set pageSize to 100 for now.
        result.questions_with_answers_percentage = percent(result.questions_with_answers_count / items.length);
        result.questions_with_accepted_answer_percentage = percent(result.questions_with_accepted_answer_count / result.questions_with_answers_count);

        if (result.questions_with_accepted_answer_count > 0) {
            result.answered_by_staff_percentage = percent(result.answered_by_staff_count / result.questions_with_accepted_answer_count);
            result.answered_by_community_percentage = percent(result.answered_by_community_count / result.questions_with_accepted_answer_count);
        }
    }

    return result;
};

const subtractDays = (date: Date, days: number) => new Date(new Date(date).setDate(date.getDate() - days));

const analyze = async (tag, numDays, count) => {
    var result = {};
    let toDate = new Date();
    toDate.setUTCHours(0, 0, 0, 0);

    for (var i = 0; i < count; i++) {
        const fromDate = subtractDays(toDate, numDays);
        const url = buildQuestionsUrl(tag, fromDate, toDate);

        const response = await fetch(url);
        const data = await response.json();

        const analysis = await analyzeQuestionsResponse(data);
        result[`${fromDate.toISOString()}-${toDate.toISOString()}`] = analysis;

        toDate = fromDate;
    }
    return result;
};
