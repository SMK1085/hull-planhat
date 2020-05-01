import _ from "lodash";
import payload from "../../_data/user-update-message.json";
import { API_PREFIX, PERSONAL_ACCESS_TOKEN } from "../../_helpers/constants";

const basePayload = _.cloneDeep(payload);

const configurePayload = (): unknown => {
  // Configure private_settings
  _.set(
    basePayload,
    "connector.private_settings.personal_acccess_token",
    PERSONAL_ACCESS_TOKEN,
  );
  _.set(basePayload, "connector.private_settings.api_prefix", API_PREFIX);
  _.set(
    basePayload,
    "connector.private_settings.contact_synchronized_segments",
    ["72abf64e-7f60-4d7e-85b8-5f2f572318bb"],
  );
  // Configure segments
  const msgSegments = [
    {
      id: "72abf64e-7f60-4d7e-85b8-5f2f572318bb",
      created_at: new Date().toISOString(),
      name: "Test Segment",
      type: "users_segment",
      updated_at: new Date().toISOString(),
      stats: {},
    },
  ];
  // Set the account
  const account = {
    external_id: "vhoih28[hbnjnmwjnjbfoho",
    id: "0df9fa5d-ce4c-4065-a8ba-3e25470f17e7",
    name: "Test 1234 Inc.",
    planhat: {
      id: "1234",
    },
  };
  _.set(basePayload, "messages[0].account", account);
  // Set the user segments
  _.set(basePayload, "messages[0].segments", msgSegments);
  // Set the planhat identifier
  _.set(basePayload, "messages[0].user.planhat.id", "5d81eb28aeeafc7a74d8f999");

  return basePayload;
};

// eslint-disable-next-line import/no-default-export
export default configurePayload;
