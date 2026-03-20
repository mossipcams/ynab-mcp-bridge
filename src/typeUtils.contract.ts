import type { ReadonlyArrayOf, ReadonlyObject } from "./typeUtils.js";
import type { AccountId, PlanId } from "./ynabTypes.js";

declare const planId: PlanId;
declare const accountId: AccountId;

type ProfileLike = ReadonlyObject<{
  id: PlanId;
  aliases: ReadonlyArrayOf<AccountId>;
}>;

const _plainStringFromBrand: string = planId;
const _readonlyShape: ProfileLike = {
  id: planId,
  aliases: [accountId],
};

// @ts-expect-error plain strings must not be assignable to branded ids
const _invalidPlanId: PlanId = "plan-1";

// @ts-expect-error readonly arrays must reject mutation
_readonlyShape.aliases.push(accountId);

// @ts-expect-error readonly object properties must reject reassignment
_readonlyShape.id = planId;
