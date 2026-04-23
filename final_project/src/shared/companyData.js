export const companyDataset = {
  google: {
    name: "Google",
    workLifeBalance: 4.2,
    companySize: "100,000+ employees",
    industry: "Internet / Cloud / AI",
    salaryHint: "$155k - $245k estimated total compensation",
    pros: [
      "Strong benefits and internal mobility",
      "Managers often protective of personal time"
    ],
    cons: [
      "Large-org processes can be slow",
      "Some teams still have high launch pressure"
    ]
  },
  meta: {
    name: "Meta",
    workLifeBalance: 3.8,
    companySize: "80,000+ employees",
    industry: "Social / AI / Consumer Tech",
    salaryHint: "$170k - $280k estimated total compensation",
    pros: [
      "High compensation and strong engineering talent density",
      "Clear product ownership on many teams"
    ],
    cons: [
      "Intensity can spike around key launches",
      "Org changes may affect team stability"
    ]
  },
  amazon: {
    name: "Amazon",
    workLifeBalance: 3.3,
    companySize: "1,500,000+ employees",
    industry: "E-commerce / Cloud",
    salaryHint: "$145k - $240k estimated total compensation",
    pros: [
      "High ownership and broad technical scope",
      "Strong cloud and data platform exposure"
    ],
    cons: [
      "On-call and operational load can be real",
      "WLB varies heavily by org"
    ]
  },
  microsoft: {
    name: "Microsoft",
    workLifeBalance: 4.1,
    companySize: "220,000+ employees",
    industry: "Cloud / Enterprise Software / AI",
    salaryHint: "$145k - $235k estimated total compensation",
    pros: [
      "Generally sustainable pace on many teams",
      "Strong benefits and internal transfer options"
    ],
    cons: [
      "Big-company coordination overhead",
      "Workload can vary significantly by org"
    ]
  },
  apple: {
    name: "Apple",
    workLifeBalance: 3.7,
    companySize: "160,000+ employees",
    industry: "Consumer Hardware / Software",
    salaryHint: "$160k - $255k estimated total compensation",
    pros: [
      "High product quality bar",
      "Compensation generally strong for core engineering roles"
    ],
    cons: [
      "Secrecy and crunch can affect pace",
      "Team experience varies substantially"
    ]
  },
  netflix: {
    name: "Netflix",
    workLifeBalance: 4,
    companySize: "10,000+ employees",
    industry: "Streaming / Platform Engineering",
    salaryHint: "$220k - $400k estimated total compensation",
    pros: [
      "High talent density and strong autonomy",
      "Senior-level compensation is highly competitive"
    ],
    cons: [
      "High expectations and lean teams",
      "Performance bar may feel intense"
    ]
  }
};

export function getCompanyRecord(companyName) {
  if (!companyName) {
    return null;
  }

  const normalized = companyName.toLowerCase();
  return (
    Object.entries(companyDataset).find(([key, value]) => {
      return normalized.includes(key) || normalized.includes(value.name.toLowerCase());
    })?.[1] ?? null
  );
}
