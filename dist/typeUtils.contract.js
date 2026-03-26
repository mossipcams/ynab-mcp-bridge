const _plainStringFromBrand = planId;
const _readonlyShape = {
    id: planId,
    aliases: [accountId],
};
// @ts-expect-error plain strings must not be assignable to branded ids
const _invalidPlanId = "plan-1";
// @ts-expect-error readonly arrays must reject mutation
_readonlyShape.aliases.push(accountId);
// @ts-expect-error readonly object properties must reject reassignment
_readonlyShape.id = planId;
export {};
