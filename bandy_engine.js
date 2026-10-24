/**
 * Bandy Pricing Engine
 *
 * Large ice surface, 11-a-side, two 45-minute halves. Higher scoring (~6-7 goals).
 * Poisson model with lambdas typically in 3.0–4.0 range.
 */

import { PoissonEngine } from './js/core/poisson_engine.js';

export class BandyEngine extends PoissonEngine {
    constructor() {
        super({
            maxGoals: 14,
            lambdaMin: 0.5,
            lambdaMax: 10.0,
            defaultTotalLine: 6.5,
            handicapLines: [-4.5, -3.5, -2.5, -1.5, 1.5, 2.5, 3.5, 4.5],
            exactGoalsMax: 10,
            htMatrixMaxGoals: 10,
            halfHandicapRange: 3,
            halfTeamTotalsMultiple: true,
            goalRanges: [
                { label: '0-3', min: 0, max: 3 },
                { label: '0-4', min: 0, max: 4 },
                { label: '0-5', min: 0, max: 5 },
                { label: '2-4', min: 2, max: 4 },
                { label: '2-5', min: 2, max: 5 },
                { label: '2-6', min: 2, max: 6 },
                { label: '3-5', min: 3, max: 5 },
                { label: '3-6', min: 3, max: 6 },
                { label: '3-7', min: 3, max: 7 },
                { label: '4-6', min: 4, max: 6 },
                { label: '4-7', min: 4, max: 7 },
                { label: '4-8', min: 4, max: 8 },
                { label: '5-7', min: 5, max: 7 },
                { label: '5-8', min: 5, max: 8 },
                { label: '5-9', min: 5, max: 9 },
                { label: '6-8', min: 6, max: 8 },
                { label: '6-9', min: 6, max: 9 },
                { label: '7-9', min: 7, max: 9 },
                { label: '7-10', min: 7, max: 10 },
                { label: '8-10', min: 8, max: 10 }
            ]
        });
    }
}
