// api/index.js | endpoint function handler
export default function handleSortedArray(request, response) {
    
    // POST method allowed only as specified
    if (request.method !== "POST") {
        // respond with 405 status code
        response.status(405).json({
            error: "Invalid request method" 
        });
        return;
    }

    // extract data from request body
    const data = request.body.data;

    // check if data exists
    if (!data) {
        // return 400 for bad request
        response.status(400).json({ 
            error: "Invalid request body. Field `data` does not exist."
        });
        return;
    }

    // check data is a string as specified
    if (typeof data !== "string") {
        // return 400 for bad request
        response.status(400).json({
            error: "Invalid request body. Field `data` must be a string."
        });
        return;
    }

    // return response which is the sorted array of characters in the string
    response.status(200).json({
        word: data.split("").sort()
    });

}