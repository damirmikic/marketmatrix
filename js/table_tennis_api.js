// Table Tennis API Module
// Handles fetching table tennis matches and odds

let runModelCallback = null;

export function setRunModelCallback(callback) {
    runModelCallback = callback;
}

export function initTableTennisLoader() {
    // Initialize table tennis data loading
    console.log('Table Tennis loader initialized');
    // For now, just trigger the model
    if (runModelCallback) runModelCallback();
}

export function handleCountryChange() {
    // Handle country selection
    console.log('Country changed');
}

export function handleLeagueChange() {
    // Handle league selection
    console.log('League changed');
}

export function handleMatchChange() {
    // Handle match selection
    console.log('Match changed');
}