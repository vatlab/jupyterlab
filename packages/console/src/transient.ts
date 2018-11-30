// Copyright (c) Jupyter Development Team.
// Distributed under the terms of the Modified BSD License.

import { IClientSession } from '@jupyterlab/apputils';

import { Cell, CodeCell } from '@jupyterlab/cells';

import { nbformat } from '@jupyterlab/coreutils';

import { KernelMessage } from '@jupyterlab/services';

import { IDisposable } from '@phosphor/disposable';

import { Signal } from '@phosphor/signaling';

/**
 * A handler for capturing API messages from other sessions that should be
 * rendered in a given parent.
 */
export class TransientHandler implements IDisposable {
  /**
   * Construct a new Transient message handler.
   */
  constructor(options: TransientHandler.IOptions) {
    this.session = options.session;
    this.session.iopubMessage.connect(
      this.onIOPubMessage,
      this
    );
    this._factory = options.cellFactory;
    this._parent = options.parent;
  }

  /**
   * Set whether the handler is able to inject Transient cells into a console.
   */
  get enabled(): boolean {
    return this._enabled;
  }
  set enabled(value: boolean) {
    this._enabled = value;
  }

  /**
   * The client session used by the Transient handler.
   */
  readonly session: IClientSession;

  /**
   * The Transient handler's parent receiver.
   */
  get parent(): TransientHandler.IReceiver {
    return this._parent;
  }

  /**
   * Test whether the handler is disposed.
   */
  get isDisposed(): boolean {
    return this._isDisposed;
  }

  /**
   * Dispose the resources held by the handler.
   */
  dispose(): void {
    if (this.isDisposed) {
      return;
    }
    this._isDisposed = true;
    this._cells.clear();
    Signal.clearData(this);
  }

  /**
   * Handler IOPub messages.
   *
   * @returns `true` if the message resulted in a new cell injection or a
   * previously injected cell being updated and `false` for all other messages.
   */
  protected onIOPubMessage(
    sender: IClientSession,
    msg: KernelMessage.IIOPubMessage
  ): boolean {
    // Only process messages if Transient cell injection is enabled,
    // or if it is a "transient_display_data" message.
    if (!this._enabled) {
      return false;
    }
    let kernel = this.session.kernel;
    if (!kernel) {
      return false;
    }
    let msgType = msg.header.msg_type;
    if (msgType !== 'transient_display_data') {
      return false;
    }
    // Check whether this message came from an external session.
    let parent = this._parent;
    let session = (msg.parent_header as KernelMessage.IHeader).session;
    if (session === kernel.clientId) {
      return false;
    }
    let parentHeader = msg.parent_header as KernelMessage.IHeader;
    let parentMsgId = parentHeader.msg_id as string;
    let cell: CodeCell | undefined;

    // the message is just a regular display_data message
    msgType = 'display_data';
    if (!this._cells.has(parentMsgId)) {
      // if "Show All Kernel Activity" is disabled and the trnasient messages
      // are passed without execute_input, create a cell without input.
      cell = this._newCell(parentMsgId);
    }

    let output = msg.content as nbformat.IOutput;
    cell = this._cells.get(parentMsgId);
    if (cell) {
      output.output_type = msgType as nbformat.OutputType;
      cell.model.outputs.add(output);
    }
    parent.update();
    return true;
  }

  /**
   * Create a new code cell for an input originated from a Transient session.
   */
  private _newCell(parentMsgId: string): CodeCell {
    let cell = this._factory();
    this._cells.set(parentMsgId, cell);
    this._parent.addCell(cell);
    return cell;
  }

  private _cells = new Map<string, CodeCell>();
  private _enabled = true;
  private _parent: TransientHandler.IReceiver;
  private _factory: () => CodeCell;
  private _isDisposed = false;
}

/**
 * A namespace for `TransientHandler` statics.
 */
export namespace TransientHandler {
  /**
   * The instantiation options for a Transient handler.
   */
  export interface IOptions {
    /**
     * The client session used by the Transient handler.
     */
    session: IClientSession;

    /**
     * The parent into which the handler will inject code cells.
     */
    parent: IReceiver;

    /**
     * The cell factory for Transient handlers.
     */
    cellFactory: () => CodeCell;
  }

  /**
   * A receiver of newly created Transient cells.
   */
  export interface IReceiver {
    /**
     * Add a newly created Transient cell.
     */
    addCell(cell: Cell): void;

    /**
     * Trigger a rendering update on the receiver.
     */
    update(): void;
  }
}
