/**
 * Futsal Pricing Engine
 *
 * Indoors, 5-a-side, two 20-minute halves. Moderate scoring (~4-6 goals).
 * Poisson model with lambdas typically in 2.0–3.5 range.
 */

import { PoissonEngine } from './js/core/poisson_engine.js';

export class FutsalEngine extends PoissonEngine {
    constructor() {
        super({
            maxGoals: 12,
            lambdaMin: 0.5,
            lambdaMax: 8.0,
            defaultTotalLine: 5.5,
            handicapLines: [-3.5, -2.5, -1.5, -0.5, 0.5, 1.5, 2.5, 3.5],
            exactGoalsMax: 8,
            htMatrixMaxGoals: 8,
            halfHandicapRange: 2.5,
            halfTeamTotalsMultiple: false,
            goalRanges: [
                { label: '0-2', min: 0, max: 2 },
                { label: '0-3', min: 0, max: 3 },
                { label: '0-4', min: 0, max: 4 },
                { label: '2-3', min: 2, max: 3 },
                { label: '2-4', min: 2, max: 4 },
                { label: '2-5', min: 2, max: 5 },
                { label: '3-4', min: 3, max: 4 },
                { label: '3-5', min: 3, max: 5 },
                { label: '3-6', min: 3, max: 6 },
                { label: '4-5', min: 4, max: 5 },
                { label: '4-6', min: 4, max: 6 },
                { label: '4-7', min: 4, max: 7 },
                { label: '5-6', min: 5, max: 6 },
                { label: '5-7', min: 5, max: 7 },
                { label: '5-8', min: 5, max: 8 },
                { label: '6-7', min: 6, max: 7 },
                { label: '6-8', min: 6, max: 8 },
                { label: '7-8', min: 7, max: 8 },
                { label: '7-9', min: 7, max: 9 },
                { label: '8-9', min: 8, max: 9 }
            ]
        });
    }
}
