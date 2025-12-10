import {
    Radar,
    RadarChart,
    PolarGrid,
    PolarAngleAxis,
    PolarRadiusAxis,
    ResponsiveContainer
} from 'recharts';

interface RiskRadarProps {
    dimensions: {
        financial: number;
        execution: number;
        dilution: number;
        competitive: number;
        regulatory: number;
    };
}

export function RiskRadar({ dimensions }: RiskRadarProps) {
    const data = [
        { subject: 'Financial', A: dimensions.financial, fullMark: 10 },
        { subject: 'Execution', A: dimensions.execution, fullMark: 10 },
        { subject: 'Dilution', A: dimensions.dilution, fullMark: 10 },
        { subject: 'Competitive', A: dimensions.competitive, fullMark: 10 },
        { subject: 'Regulatory', A: dimensions.regulatory, fullMark: 10 },
    ];

    return (
        <div className="w-full h-[300px] flex justify-center items-center">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart cx="50%" cy="50%" outerRadius="80%" data={data}>
                    <PolarGrid stroke="rgba(255,255,255,0.1)" />
                    <PolarAngleAxis
                        dataKey="subject"
                        tick={{ fill: '#a1a1aa', fontSize: 12 }}
                    />
                    <PolarRadiusAxis
                        angle={30}
                        domain={[0, 10]}
                        stroke="rgba(255,255,255,0.1)"
                        tick={false}
                        axisLine={false}
                    />
                    <Radar
                        name="Risk"
                        dataKey="A"
                        // Green for Low Risk (High Score), Red for High Risk (Low Score)?? 
                        // Wait, usually "Risk Score 8/10" means "Safe" (8/10 Quality) or "Risky" (8/10 Risk)?
                        // In my system: "Risk Score" usually implies Quality/Safety. High = Good.
                        // So a BIG shape is GOOD? 
                        // If dimensions are "Financial Risk", then high = risky.
                        // Lets assume 10 = Best/Safe/Low Risk based on "Overall Score: 8.5/10" context in plan.
                        stroke="#3b82f6"
                        fill="#3b82f6"
                        fillOpacity={0.3}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
