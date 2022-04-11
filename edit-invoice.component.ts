import { Component, OnInit, Input } from "@angular/core";

import { ToastrService } from "ngx-toastr";
import { NgbActiveModal, NgbModal } from "@ng-bootstrap/ng-bootstrap";

import { WaitService } from "../../../services/wait/wait.service";
import { PriceService } from "../../../services/price/price.service";

import { InvoicesService } from "../../../services/invoices/invoices.service";
import { PaymentService } from "../../../services/payment/payment.service";
import { LoginService } from "../../../services/login/login.service";

import * as moment from "moment";

@Component({
  selector: "app-edit-invoice",
  templateUrl: "./edit-invoice.component.html",
  styleUrls: ["./edit-invoice.component.scss"],
})
export class EditInvoiceComponent implements OnInit {
  @Input() invoiceId: number = null;

  data: any = null;
  subTotal: number = 0;
  taxAmount: number = 0;
  discountAmmount: number = 0;

  mileageFee: number = 0;

  total: number = 0;

  exemptTax: boolean = false;
  isDefaultEdited: boolean = false;

  rateTypes: any = null;
  selectedRateType: any = null;
  classTypes: any = null;
  additionalItems: any = null;
  currentRateTypeId: number;
  classType: number;

  storageRateMeta: any = null;

  newPayments: any = [];
  currentUser: any = null;

  appOrderSubTotal: number = null;

  constructor(
    private modal: NgbActiveModal,
    private toastr: ToastrService,
    private WaitService: WaitService,
    private PriceService: PriceService,
    private InvoicesService: InvoicesService,
    private PaymentService: PaymentService,
    private modalService: NgbModal,
    private LoginService: LoginService
  ) {}

  ngOnInit() {
    this.currentUser = this.LoginService.getCurrentUser();
    this.getInvoiceData();
  }

  close() {
    this.modal.close();
  }

  getInvoiceData() {
    this.WaitService.start();
    this.InvoicesService.getInvoiceById(this.invoiceId)
      .then((res: any) => {
        this.data = res.data;
        this.appOrderSubTotal =
          this.data.orderInfo.milesCustomerToShop *
          parseFloat(this.data.orderInfo.appServicePerMileCharge);

        this.appOrderSubTotal += parseFloat(
          this.data.orderInfo.appServiceCharge
        );

        this.getData();
        this.WaitService.stop();
      })
      .catch((err) => {
        console.log(err);
        this.WaitService.stop();
        this.toastr.error(err.error.error);
      });
  }

  getData() {
    this.data.orderInfo.storedDays = this.data.orderInfo.autoStoredCountDays
      ? this.data.orderInfo.totalStoredDays
      : this.data.orderInfo.storedDays;

    if (this.data.orderInfo && this.data.orderInfo.appService) {
      this.data.orderInfo.appService.price = parseFloat(
        this.data.orderInfo.appService.price
      );
      this.data.orderInfo.appService.pricePerMile = parseFloat(
        this.data.orderInfo.appService.pricePerMile
      );
    }

    this.loadStorageRates();

    this.loadRates();
  }

  calculatePrice() {
    let data = this.PriceService.calculatePrice(
      this.data.orderInfo,
      this.selectedRateType,
      this.exemptTax,
      parseFloat(this.data.orderInfo.serviceCharge),
      parseFloat(this.data.orderInfo.servicePerMileCharge)
    );

    this.subTotal = data.subTotal;
    this.taxAmount = data.taxAmount;
    this.discountAmmount = data.discountAmmount;
    this.mileageFee = data.mileageFee;
    this.total = data.total;

    this.calculateInvoiceBalance();
  }

  percentValChange(e) {
    let t = e.target.value.toString();
    t =
      t.indexOf(".") >= 0
        ? t.substr(0, t.indexOf(".")) + t.substr(t.indexOf("."), 3)
        : t;
    t = parseFloat(t);
    this.data.orderInfo.discountValue = t ? t : null;
    e.target.value = t ? t : null;
    this.calculatePrice();
  }

  loadRates() {
    this.rateTypes = [];
    this.classTypes = [];
    this.selectedRateType = null;

    if (!this.data.orderInfo.accountId || !this.data.orderInfo.serviceId) {
      this.calculatePrice();
      return;
    }

    this.WaitService.start();
    const getSericePrice = this.PriceService.getService(
      this.data.orderInfo.accountId,
      this.data.orderInfo.serviceId
    );

    const loadAdditionalServices = this.PriceService.getServices(
      this.data.orderInfo.accountId,
      {
        isActive: true,
        serviceType: "additional",
      }
    );

    return Promise.all([getSericePrice, loadAdditionalServices])
      .then((response: any) => {
        this.WaitService.stop();
        const result = response[0];

        if (result.data) {
          this.rateTypes = result.data.rates;
          if (this.data.orderInfo.isImpound)
            this.rateTypes = this.rateTypes.filter((x) => x.rateTypesId != 7);

          this.classTypes = result.data.classes;

          this.additionalItems = response[1].data.map((x) => {
            x.name = x.label;
            return x;
          });

          const additionalItemsIds =
            this.data.orderInfo.orderAdditionalItems.map((x) => x.id);

          // filter additionalItems
          this.additionalItems = this.additionalItems.filter(
            (x) => !additionalItemsIds.includes(x.id)
          );

          if (!this.data.orderInfo.id || this.isDefaultEdited) {
            this.data.orderInfo.classTypeId = this.classTypes[0].id;
            this.data.orderInfo.rateTypeId = this.rateTypes[0].rateTypesId;
          }

          this.changeRateType();

          if (!this.selectedRateType.additionalItems)
            this.selectedRateType.additionalItems = [];
        }
      })
      .catch((err) => {
        this.WaitService.stop();
        this.toastr.error(err.error.error);
      });
  }

  changeRateType() {
    if (!this.data.orderInfo.rateTypeId) {
      this.data.orderInfo.classTypeId = null;
      return;
    }

    this.selectedRateType = this.rateTypes.filter(
      (x) => x.rateTypesId == this.data.orderInfo.rateTypeId
    )[0];

    if (!this.selectedRateType.additionalItems)
      this.selectedRateType.additionalItems = [];

    //prevent orderMainItems and orderAdditionalItems to updated on load
    if (!this.isDefaultEdited && this.data.orderInfo.id) {
      if (this.selectedRateType)
        this.selectedRateType.additionalItems =
          this.data.orderInfo.orderAdditionalItems;
      this.isDefaultEdited = true;
      this.calculatePrice();
      return;
    }

    this.changeClassType();
  }

  changeClassType() {
    if (!this.data.orderInfo.classTypeId) return;

    let selectedClassTypeForStorage = this.storageRateMeta.filter(
      (x) => x.classTypesId == this.data.orderInfo.classTypeId
    );

    if (selectedClassTypeForStorage && selectedClassTypeForStorage.length)
      this.data.orderInfo.storedPerDayPrice =
        selectedClassTypeForStorage[0].items[0].value;
    else this.data.orderInfo.storedPerDayPrice = 0;

    this.data.orderInfo.orderMainItems = [];

    this.WaitService.start();
    this.PriceService.getClassTypeRate(
      this.data.orderInfo.accountId,
      this.data.orderInfo.serviceId,
      this.selectedRateType.rateTypesId,
      this.data.orderInfo.classTypeId
    )
      .then((response) => {
        this.WaitService.stop();
        let result = JSON.parse(JSON.stringify(response));

        if (!result.data) {
          this.data.orderInfo.orderMainItems = this.selectedRateType.items;
          this.data.orderInfo.orderMainItems.forEach((x) => {
            x.value = 0;
          });
        } else {
          this.data.orderInfo.orderMainItems = result.data.items;
        }

        this.data.orderInfo.orderMainItems.forEach((x) => {
          x.qty = x.type == "quantity" ? parseFloat(x.value) : 1;
          x.price = x.type == "quantity" ? 1 : parseFloat(x.value);
        });

        if (this.selectedRateType && this.selectedRateType.additionalItems) {
          this.selectedRateType.additionalItems.forEach((x) => {
            x.qty = 1;
            x.price = x.value;
          });

          let items = [];
          this.additionalItems.forEach((x) => {
            let index = this.selectedRateType.additionalItems.findIndex(
              (i) => i.id == x.id
            );

            if (index == -1) items.push(x);
          });
          this.additionalItems = items;
        }

        this.data.orderInfo.orderAdditionalItems =
          this.selectedRateType.additionalItems;

        this.calculatePrice();
        this.updateAdditionalItemPrice();
      })
      .catch((err) => {
        this.WaitService.stop();
        this.toastr.error(err.error.error);
      });
  }

  updateAdditionalItemPrice() {
    const serviceIds =
      this.data.orderInfo.orderAdditionalItems &&
      this.data.orderInfo.orderAdditionalItems.length
        ? this.data.orderInfo.orderAdditionalItems.map((x) => x.id)
        : [];

    if (serviceIds && serviceIds.length) {
      this.WaitService.start();
      let promiseArray = [];

      serviceIds.forEach((x) => {
        promiseArray.push(
          this.PriceService.getClassTypeRate(
            this.data.orderInfo.accountId,
            x,
            6,
            this.data.orderInfo.classTypeId
          )
        );
      });

      return Promise.all(promiseArray)
        .then((result: any) => {
          this.WaitService.stop();

          if (result && result.length) {
            console.log(result);
            result.forEach((x, index) => {
              this.data.orderInfo.orderAdditionalItems[index].price =
                x.data && x.data.items && x.data.items.length
                  ? parseFloat(x.data.items[0].value)
                  : 1;
            });
          }
          this.calculatePrice();
        })
        .catch((err) => {
          this.WaitService.stop();
          this.toastr.error("Something Went Wrong");
        });
    }
  }

  loadStorageRates() {
    this.WaitService.start();
    this.PriceService.getStorageRate(
      this.data.orderInfo.accountId,
      this.data.orderInfo.classTypeId
    )
      .then((response) => {
        let result = JSON.parse(JSON.stringify(response));
        this.storageRateMeta = result.data;
        this.WaitService.stop();
      })
      .catch((err) => {
        this.WaitService.stop();
      });
  }

  addAdditionalItem(value) {
    let index = this.additionalItems.findIndex((x) => x.id == value);
    let item = this.additionalItems[index];
    item.qty = 1;
    item.price = 0;
    item.value = 0;

    this.selectedRateType.additionalItems.push(item);
    this.data.orderInfo.orderAdditionalItems =
      this.selectedRateType.additionalItems;
    this.additionalItems.splice(index, 1);

    this.calculatePrice();
    //
    if (!this.data.orderInfo.classTypeId) {
      this.toastr.error("Please Select Class Type");
      return;
    }

    this.WaitService.start();
    this.PriceService.getClassTypeRate(
      this.data.orderInfo.accountId,
      value,
      6,
      this.data.orderInfo.classTypeId
    )
      .then((result: any) => {
        this.WaitService.stop();

        item.qty = 1;
        if (result.data && result.data.items && result.data.items.length)
          item.price = parseFloat(result.data.items[0].value);
        else item.price = 1;

        this.selectedRateType.additionalItems.push(item);

        this.data.orderInfo.orderAdditionalItems =
          this.selectedRateType.additionalItems;
        this.calculatePrice();
      })
      .catch((err) => {
        this.WaitService.stop();
        this.toastr.error("Something Went Wrong");
      });
  }

  removeRateTypeItem(item) {
    let index = this.data.orderInfo.orderMainItems.findIndex(
      (x) => x.key == item.key
    );
    this.data.orderInfo.orderMainItems.splice(index, 1);
    this.calculatePrice();
  }

  removeAdditionalItem(item) {
    let index = this.selectedRateType.additionalItems.findIndex(
      (x) => x.id == item.id
    );
    this.selectedRateType.additionalItems.splice(index, 1);
    this.data.orderInfo.orderAdditionalItems =
      this.selectedRateType.additionalItems;

    this.additionalItems.push({
      id: item.id,
      name: item.name,
      category: item.category,
    });

    this.calculatePrice();
  }

  countDays(autoStoredCountDays: boolean) {
    if (
      autoStoredCountDays &&
      this.storageRateMeta &&
      this.storageRateMeta.length
    )
      this.data.orderInfo.storedDays = this.data.orderInfo.totalStoredDays;

    this.calculatePrice();
  }

  save() {
    let data = {
      invoiceId: this.data.id,
      orderId: this.data.orderId,
      invoiceTotal:
        this.data.orderInfo.orderType == "app"
          ? this.data.orderInfo.invoiceTotal
          : this.total,
      invoiceBalance: this.data.orderInfo.invoiceBalance,
      invoiceNotes: this.data.orderInfo.invoiceNotes,
      rateTypeId: this.data.orderInfo.rateTypeId,
      classTypeId: this.data.orderInfo.classTypeId,
      billingType: this.data.orderInfo.billingType,
      discountType: this.data.orderInfo.discountType,
      discountValue: this.data.orderInfo.discountValue,
      orderAdditionalItems: this.data.orderInfo.orderAdditionalItems,
      orderMainItems: this.data.orderInfo.orderMainItems,
      payments: this.data.payments ? this.data.payments : [],
      removeStorageCharges: this.data.orderInfo.removeStorageCharges,
      autoStoredCountDays: this.data.orderInfo.autoStoredCountDays,
      storedPerDayPrice: this.data.orderInfo.storedPerDayPrice,
      storedDays: this.data.orderInfo.storedDays,
    };

    if (this.newPayments && this.newPayments.length) {
      let temp = this.newPayments.filter(
        (x) => x.paymentMethod != "Credit/Debit card"
      );
      data.payments = data.payments.concat(temp);
    }

    this.WaitService.start();
    this.InvoicesService.save(data)
      .then(() => {
        this.WaitService.stop();
        this.toastr.success("Changes Saved");
        this.close();
      })
      .catch((err) => {
        this.WaitService.stop();
        this.toastr.error(err.error.error);
      });
  }

  removePaymentItem(index) {
    this.newPayments.splice(index, 1);
    this.calculateInvoiceBalance();
  }

  setDate(date, index) {
    this.newPayments[index].date = date;
  }

  calculateInvoiceBalance() {
    const totalPrice = this.total.toFixed(2);
    let paymentTotal = 0;
    if (this.data.payments && this.data.payments.length)
      this.data.payments.forEach((x) => {
        x.amount = parseFloat(x.amount);
        if (Number.isNaN(x.amount)) x.amount = 0;

        if (x.paymentType == "Refund") x.amount = -Math.abs(x.amount);
        else x.amount = Math.abs(x.amount);

        paymentTotal = paymentTotal + parseFloat(x.amount);
      });

    // unsaved Payments
    if (this.newPayments && this.newPayments.length)
      this.newPayments.forEach((x) => {
        x.amount = parseFloat(x.amount);
        if (Number.isNaN(x.amount)) x.amount = 0;

        if (x.paymentType == "Refund") x.amount = -Math.abs(x.amount);
        else x.amount = Math.abs(x.amount);

        paymentTotal = paymentTotal + parseFloat(x.amount);
      });

    paymentTotal = parseFloat(paymentTotal.toFixed(2));

    this.data.orderInfo.invoiceBalance = parseFloat(totalPrice) - paymentTotal;
  }

  paymentsUpdated(data) {
    this.data.payments = data.confirmedPayments;
    this.newPayments = data.newPayments;

    this.calculateInvoiceBalance();
  }
}
