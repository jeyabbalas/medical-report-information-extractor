async function fetchTextFile(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        return response.text();
    } catch (error) {
        console.error('Failed to fetch TXT file:', error);
    }
}


async function fetchJsonFile(url) {
    try {
        const response = await fetch(url);
        if (!response.ok) {
            throw new Error(`Failed to fetch: ${response.status} ${response.statusText}`);
        }
        return response.json();
    } catch (error) {
        console.error('Failed to fetch JSON file:', error);
    }
}


async function fetchJsonFiles(urls) {
    try {
        const responses = await Promise.all(urls.map(url => fetchJsonFile(url)));
        return responses;
    } catch (error) {
        console.error('Failed to fetch JSON files:', error);
    }
}
