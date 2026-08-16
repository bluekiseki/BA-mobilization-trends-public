export const NAMEPLATE = {
  studentName: [-0.584, -1.0847, 0.9008, 0.5254],
  bondRank: [-0.708, -0.9576, 0.1157, 0.2797],
  starGrade: [0.3444, -0.8983, 0.3747, 0.322],
  position: [-0.7163, 0.5508, 0.5069, 0.4237],
  level: [-0.7548, -0.5169, 0.2369, 0.3475],
  squadType: [0.7466, -0.8983, 0.314, 0.3136],
} as const;

export const SUB_FIELDS = {
  weaponLevel: [0.2028, 0.1237, 0.111, 0.2423],
  weaponStar: [0.6317, 0.6263, 0.1515, 0.2216],
  skills: [
    [0.0373, 0.7118, 0.1546, 0.179],
    [0.2386, 0.7162, 0.1421, 0.1747],
    [0.4326, 0.6987, 0.1411, 0.1834],
    [0.6276, 0.7031, 0.1473, 0.1921],
  ],
  equipmentTier: [
    [0.0259, 0.6686, 0.0731, 0.1857],
    [0.195, 0.6543, 0.0757, 0.2114],
    [0.3698, 0.6829, 0.07, 0.1657],
  ],
  equipmentIcon: [
    [0.052, 0.114, 0.129, 0.751],
    [0.222, 0.109, 0.129, 0.743],
    [0.393, 0.117, 0.13, 0.723],
  ],
  // equipment_slot_3 in calibration.yaml is bond gear, not a
  // fourth regular equipment slot.
  gearTier: [0.5423, 0.6705, 0.0485, 0.1818],
} as const;

export const SECTION_BOUNDARIES = [0, 0.226, 0.422, 0.618, 0.784, 0.934, 1];
export const SECTION_NAMES = ['header', 'stat', 'skill', 'weapon', 'equipment', 'bottom'] as const;
