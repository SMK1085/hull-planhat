import _ from "lodash";
import PrivateSettings, { MappingEntry } from "../types/private-settings";
import IHullUserUpdateMessage from "../types/user-update-message";
import {
  IPlanhatContact,
  IPlanhatCompany,
  IPlanhatEvent,
  IOperationEnvelope,
  PlanhatLicense,
} from "../core/planhat-objects";
import PLANHAT_PROPERTIES from "../core/planhat-properties";
import IHullAccountUpdateMessage from "../types/account-update-message";
import IHullUserEvent from "../types/user-event";
import { IHullUserAttributes } from "../types/user";
import IHullAccount, { IHullAccountAttributes } from "../types/account";
import ApiResultObject from "../types/api-result";
import { IPlanhatAccountDictionary } from "../types/planhat-account-dict";

class MappingUtil {
  private connectorSettings: PrivateSettings;

  constructor(connectorSettings: PrivateSettings) {
    this.connectorSettings = connectorSettings;
  }

  /**
   * Maps a hull user object to a Planhat contact object
   */
  public mapHullUserToPlanhatContact(
    message: IHullUserUpdateMessage,
  ): IPlanhatContact {
    // Map the service props so we can look them up
    const mappedServiceProps = {};
    _.forIn(PLANHAT_PROPERTIES.CONTACTS, (v: string, k: string) => {
      _.set(mappedServiceProps, k, v);
    });
    // Instantiate ref
    const serviceObject: IPlanhatContact = {
      companyId: undefined,
    };
    // Map all standard attributes
    const mappings = this.connectorSettings.contact_attributes_outbound;
    _.forEach(mappings, (mapping: MappingEntry) => {
      if (
        mapping.service_field_name !== undefined &&
        _.get(mappedServiceProps, mapping.service_field_name, undefined) !==
          undefined
      ) {
        // Ensure we get the proper message property, we don't nest the account inside the user
        // when we receive data from Kraken, so if the mapping starts with `account.`, we
        // don't prefix it with `user.`:
        const messageProperty: string = _.startsWith(
          mapping.hull_field_name,
          "account.",
        )
          ? (mapping.hull_field_name as string)
          : `user.${mapping.hull_field_name}`;
        // Make sure we have a consistent `undefined` if no data is present,
        // so we can rely on it for reducing the object
        _.set(
          serviceObject,
          mapping.service_field_name,
          _.get(message, messageProperty, undefined),
        );
      }
    });

    // Company ID can only be the internal ID from Planhat
    // so we need to overwrite legacy configurations
    _.set(
      serviceObject,
      "companyId",
      _.get(message, "account.planhat.id", undefined),
    );

    // Map custom attributes
    const mappingsCustom = this.connectorSettings
      .contact_custom_attributes_outbound;
    _.forEach(mappingsCustom, (mapping: MappingEntry) => {
      if (
        mapping.service_field_name !== undefined &&
        _.trim(mapping.service_field_name).length !== 0
      ) {
        const sanitizedName = _.trim(mapping.service_field_name);
        const messageProperty: string = _.startsWith(
          mapping.hull_field_name,
          "account.",
        )
          ? (mapping.hull_field_name as string)
          : `user.${mapping.hull_field_name}`;
        _.set(
          serviceObject,
          `custom.${sanitizedName}`,
          _.get(message, messageProperty, undefined),
        );
      }
    });

    // Remove all undefined values from the resulting object
    return _.pickBy(serviceObject, (v: unknown, k: string) => {
      if (k === "companyId") {
        // only required field
        return true;
      }
      return _.identity(v);
    }) as IPlanhatContact;
  }

  /**
   * Maps all hull user envelopes to the Planhat account dictionary.
   *
   * @param {Array<IOperationEnvelope<IPlanhatContact>>} envelopes The envelopes to process
   * @returns {IPlanhatAccountDictionary} The resulting dictionary
   * @memberof MappingUtil
   */
  // eslint-disable-next-line class-methods-use-this
  public mapHullUserEnvelopesToPlanhatAccountDict(
    envelopes: Array<IOperationEnvelope<IPlanhatContact>>,
  ): IPlanhatAccountDictionary {
    const dict: IPlanhatAccountDictionary = {};

    envelopes.forEach(envleope => {
      const msg = envleope.msg as IHullUserUpdateMessage;
      const hullId = _.get(msg, "account.id", undefined);
      const hullExternalId = _.get(msg, "account.external_id", undefined);
      const serviceId = _.get(msg, "account.planhat.id", undefined);
      if (
        _.get(dict, hullId, undefined) === undefined &&
        msg.account !== undefined
      ) {
        dict[hullId] = {
          hullId,
          hullExternalId,
          serviceId,
          hullProfile: msg.account,
        };
      }
    });

    return dict;
  }

  /**
   * mapHullUserEventToPlanhatEvent
   */
  public mapHullUserEventToPlanhatEvent(
    message: IHullUserUpdateMessage,
    hullEvent: IHullUserEvent,
  ): IPlanhatEvent {
    // Map the service props so we can look them up
    const mappedServiceProps = {};
    _.forIn(PLANHAT_PROPERTIES.CONTACTS, (v: string, k: string) => {
      _.set(mappedServiceProps, k, v);
    });
    // Instantiate ref
    const serviceObject: IPlanhatEvent = {
      name: undefined,
      action: undefined,
    };

    // Obtain the mapped attributes from the Hull user
    const mappings = this.connectorSettings.contact_attributes_outbound;
    if (_.find(mappings, { service_field_name: "name" })) {
      const mapping: MappingEntry = _.find(mappings, {
        service_field_name: "name",
      }) as MappingEntry;
      serviceObject.name = _.get(
        message,
        `user.${mapping.hull_field_name}`,
        undefined,
      );
    }

    if (_.find(mappings, { service_field_name: "externalId" })) {
      const mapping: MappingEntry = _.find(mappings, {
        service_field_name: "externalId",
      }) as MappingEntry;
      serviceObject.externalId = _.get(
        message,
        `user.${mapping.hull_field_name}`,
        undefined,
      );
    }

    if (_.find(mappings, { service_field_name: "email" })) {
      const mapping: MappingEntry = _.find(mappings, {
        service_field_name: "email",
      }) as MappingEntry;
      serviceObject.email = _.get(
        message,
        `user.${mapping.hull_field_name}`,
        undefined,
      );
    }

    // Obtain the external_id from the Hull account
    if (_.get(message, "account.external_id", undefined) !== undefined) {
      serviceObject.companyExternalId = _.get(
        message,
        "account.external_id",
        undefined,
      );
    }

    // Map the event name and date
    serviceObject.action = hullEvent.event;
    serviceObject.date = hullEvent.created_at;
    // Map all event properties
    serviceObject.info = hullEvent.properties;

    return serviceObject;
  }

  /**
   * Maps a hull account object to a Planhat company object
   */
  public mapHullAccountToPlanhatCompany(
    message: IHullAccountUpdateMessage,
  ): IPlanhatCompany {
    // Map the service props so we can look them up
    const mappedServiceProps = {};
    _.forIn(PLANHAT_PROPERTIES.COMPANIES, (v: string, k: string) => {
      _.set(mappedServiceProps, k, v);
    });
    // Instantiate ref
    const serviceObject: IPlanhatCompany = {
      name: undefined,
    };
    // Map all standard attributes
    const mappings = this.connectorSettings.account_attributes_outbound;
    _.forEach(mappings, (mapping: MappingEntry) => {
      if (
        mapping.service_field_name !== undefined &&
        _.get(mappedServiceProps, mapping.service_field_name, undefined) !==
          undefined
      ) {
        const messageProperty = `account.${mapping.hull_field_name as string}`;
        // Make sure we have a consistent `undefined` if no data is present,
        // so we can rely on it for reducing the object
        _.set(
          serviceObject,
          mapping.service_field_name,
          _.get(message, messageProperty, undefined),
        );
      }
    });

    // Map custom attributes
    const mappingsCustom = this.connectorSettings
      .account_custom_attributes_outbound;
    _.forEach(mappingsCustom, (mapping: MappingEntry) => {
      if (
        mapping.service_field_name !== undefined &&
        _.trim(mapping.service_field_name).length !== 0
      ) {
        const sanitizedName = _.trim(mapping.service_field_name);
        const messageProperty = `account.${mapping.hull_field_name}`;
        _.set(
          serviceObject,
          `custom.${sanitizedName}`,
          _.get(message, messageProperty, undefined),
        );
      }
    });

    // Make sure we have the `external_id` set
    if (_.get(serviceObject, "externalId", undefined) === undefined) {
      _.set(
        serviceObject,
        "externalId",
        _.get(message, "account.external_id", undefined),
      );
    }

    // Add the id if present
    if (_.get(message, "account.planhat.id", undefined) !== undefined) {
      _.set(serviceObject, "id", _.get(message, "account.planhat.id"));
    }

    // Remove all undefined values from the resulting object
    return _.pickBy(serviceObject, (v: unknown, k: string) => {
      if (k === "name") {
        // only required field
        return true;
      }
      return _.identity(v);
    }) as IPlanhatCompany;
  }

  public mapHullAccountProfileToPlanhatCompany(
    account: IHullAccount,
  ): IPlanhatCompany {
    // Map the service props so we can look them up
    const mappedServiceProps = {};
    _.forIn(PLANHAT_PROPERTIES.COMPANIES, (v: string, k: string) => {
      _.set(mappedServiceProps, v, k);
    });
    // Instantiate ref
    const serviceObject: IPlanhatCompany = {
      name: undefined,
    };
    // Map all standard attributes
    const mappings = this.connectorSettings.account_attributes_outbound;
    _.forEach(mappings, (mapping: MappingEntry) => {
      if (
        mapping.service_field_name !== undefined &&
        _.get(mappedServiceProps, mapping.service_field_name, undefined) !==
          undefined
      ) {
        const profileProperty = `${mapping.hull_field_name}`;
        // Make sure we have a consistent `undefined` if no data is present,
        // so we can rely on it for reducing the object
        _.set(
          serviceObject,
          _.get(mappedServiceProps, mapping.service_field_name),
          _.get(account, profileProperty, undefined),
        );
      }
    });

    // Map custom attributes
    const mappingsCustom = this.connectorSettings
      .account_custom_attributes_outbound;
    _.forEach(mappingsCustom, (mapping: MappingEntry) => {
      if (
        mapping.service_field_name !== undefined &&
        _.trim(mapping.service_field_name).length !== 0
      ) {
        const sanitizedName = _.trim(mapping.service_field_name);
        const profileProperty = `${mapping.hull_field_name}`;
        _.set(
          serviceObject,
          `custom.${sanitizedName}`,
          _.get(account, profileProperty, undefined),
        );
      }
    });

    // Make sure we have the `external_id` set
    if (_.get(serviceObject, "externalId", undefined) === undefined) {
      _.set(
        serviceObject,
        "externalId",
        _.get(account, "external_id", undefined),
      );
    }

    // Add the id if present
    if (_.get(account, "planhat.id", undefined) !== undefined) {
      _.set(serviceObject, "id", _.get(account, "planhat.id"));
    }

    // Remove all undefined values from the resulting object
    return _.pickBy(serviceObject, (v: unknown, k: string) => {
      if (k === "name") {
        // only required field
        return true;
      }
      return _.identity(v);
    }) as IPlanhatCompany;
  }

  /**
   * Map a Planhat Contact to user attributes in Hull.
   *
   * @param {IPlanhatContact} dataObject The contact object from Planhat.
   * @returns {IHullUserAttributes} The object representing the Hull user attributes.
   * @memberof MappingUtil
   */
  // eslint-disable-next-line class-methods-use-this
  public mapPlanhatContactToUserAttributes(
    dataObject: IPlanhatContact,
  ): IHullUserAttributes {
    const attributes: IHullUserAttributes = {};

    _.forIn(dataObject, (v: unknown, k: string) => {
      if (k === "_id") {
        _.set(attributes, `planhat/id`, v);
      } else if (!_.startsWith(k, "_")) {
        _.set(attributes, `planhat/${_.snakeCase(k)}`, v);
      }
    });

    // Set the top level name attribute
    if (_.get(dataObject, "name", undefined) !== undefined) {
      _.set(attributes, "name", {
        value: _.get(dataObject, "name"),
        operation: "setIfNull",
      });
    }

    return attributes;
  }

  /**
   * Map a Planhat company to account attributes in Hull.
   *
   * @param {IPlanhatCompany} dataObject The company object from Planhat.
   * @returns {IHullAccountAttributes} The object representing the Hull account attributes.
   * @memberof MappingUtil
   */
  // eslint-disable-next-line class-methods-use-this
  public mapPlanhatCompanyToAccountAttributes(
    dataObject: IPlanhatCompany,
  ): IHullAccountAttributes {
    const attributes: IHullAccountAttributes = {};

    _.forIn(dataObject, (v: unknown, k: string) => {
      if (k === "_id") {
        _.set(attributes, `planhat/id`, v);
      } else if (k === "lastUpdated") {
        _.set(attributes, `planhat/last_updated_at`, v);
      } else if (!_.startsWith(k, "_") && k !== "shareable") {
        _.set(attributes, `planhat/${_.snakeCase(k)}`, v);
      }
    });

    // Set the top level name attribute
    if (_.get(dataObject, "name", undefined) !== undefined) {
      _.set(attributes, "name", {
        value: _.get(dataObject, "name"),
        operation: "setIfNull",
      });
    }

    return attributes;
  }

  /**
   * Updates all user envelopes which have the same Hull account to avoid issues with creating accounts within the same batch.
   *
   * @param {Array<IOperationEnvelope<IPlanhatCompany>>} envelopes All valid envelopes.
   * @param {IOperationEnvelope<IPlanhatCompany>} currentEnvelope The current enevelope.
   * @param {ApiResultObject<IPlanhatCompany>} updateOrInsertResult The insert or update result of the current envelope's account.
   * @memberof MappingUtil
   */
  // eslint-disable-next-line class-methods-use-this
  public updateUserEnvelopesWithCompanyId(
    envelopes: Array<IOperationEnvelope<IPlanhatContact>>,
    currentEnvelope: IOperationEnvelope<IPlanhatContact>,
    updateOrInsertResult: ApiResultObject<IPlanhatCompany>,
  ): void {
    _.forEach(
      _.filter(envelopes, e => {
        return (
          e.msg.account &&
          e.msg.account.id ===
            (currentEnvelope.msg.account as IHullAccount).id &&
          e.msg.message_id !== currentEnvelope.msg.message_id
        );
      }) as Array<IOperationEnvelope<IPlanhatContact>>,
      (e: IOperationEnvelope<IPlanhatContact>) => {
        _.set(
          e,
          "serviceObject.companyId",
          _.get(updateOrInsertResult, "data._id", undefined),
        );
      },
    );
  }

  /**
   * Updates all envelopes which have the same Hull account to avoid issues with creating accounts within the same batch.
   *
   * @param {Array<IOperationEnvelope<IPlanhatCompany>>} envelopes All valid envelopes.
   * @param {IOperationEnvelope<IPlanhatCompany>} currentEnvelope The current enevelope.
   * @param {ApiResultObject<IPlanhatCompany>} updateOrInsertResult The insert or update result of the current envelope's account.
   * @memberof MappingUtil
   */
  // eslint-disable-next-line class-methods-use-this
  public updateEnvelopesWithCompanyId(
    envelopes: Array<IOperationEnvelope<IPlanhatCompany>>,
    currentEnvelope: IOperationEnvelope<IPlanhatCompany>,
    updateOrInsertResult: ApiResultObject<IPlanhatCompany>,
  ): void {
    _.forEach(
      _.filter(envelopes, e => {
        return (
          e.msg.account &&
          e.msg.account.id ===
            (currentEnvelope.msg.account as IHullAccount).id &&
          e.msg.message_id !== currentEnvelope.msg.message_id
        );
      }) as Array<IOperationEnvelope<IPlanhatCompany>>,
      (e: IOperationEnvelope<IPlanhatCompany>) => {
        _.set(
          e,
          "serviceObject.id",
          _.get(updateOrInsertResult, "data._id", undefined),
        );
      },
    );
  }

  // eslint-disable-next-line class-methods-use-this, @typescript-eslint/no-unused-vars
  public mapHullAccountToLicenses(
    companyId: string,
    account: IHullAccount,
  ): PlanhatLicense[] {
    if (
      this.connectorSettings.account_licenses_attribute === undefined ||
      this.connectorSettings.account_licenses_attributes_outbound ===
        undefined ||
      this.connectorSettings.account_licenses_attributes_outbound === []
    ) {
      // eslint-disable-next-line no-console
      console.log(
        ">>> MAP SKIP: Incomplete mappings for licenses",
        this.connectorSettings,
      );
      return [];
    }

    if (
      _.get(
        account,
        this.connectorSettings.account_licenses_attribute,
        undefined,
      ) === undefined
    ) {
      // eslint-disable-next-line no-console
      console.log(
        ">>> MAP SKIP: Account has no license attribute",
        this.connectorSettings,
      );
      return [];
    }

    const hullLicenses = _.get(
      account,
      this.connectorSettings.account_licenses_attribute,
    );

    if (!_.isArray(hullLicenses)) {
      // eslint-disable-next-line no-console
      console.log(
        ">>> MAP SKIP: Account license attribute is no array",
        this.connectorSettings,
        hullLicenses,
      );
      return [];
    }

    const phLicenses = _.map(hullLicenses, l =>
      this.mapHullLicenseItemToPlanhat(companyId, l),
    );
    return phLicenses;
  }

  private mapHullLicenseItemToPlanhat(
    companyId: string,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    item: any,
  ): PlanhatLicense {
    const phItem = {
      companyId,
    };

    _.forEach(
      this.connectorSettings
        .account_licenses_attributes_outbound as MappingEntry[],
      m => {
        if (_.get(item, m.hull_field_name as string, undefined) !== undefined) {
          _.set(
            phItem,
            m.service_field_name as string,
            _.get(item, m.hull_field_name as string),
          );
        }
      },
    );

    return phItem as PlanhatLicense;
  }
}

// eslint-disable-next-line import/no-default-export
export default MappingUtil;
